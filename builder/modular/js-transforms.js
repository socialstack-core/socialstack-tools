var babelCore = require("@babel/core");
var presetEnv = require('@babel/preset-env');
var presetReact = require('@babel/preset-react');
var presetTs = require('@babel/preset-typescript');
var mangleNames = require('./babel-mangler/index.js');

/*
* Imports for file types to not be treated as a static file.
*/
var nonStaticFileTypes = {
	js: true,
	jsx: true,
	scss: true,
	css: true,
	ts: true,
	tsx: true
};

/*
* Maps a path (required string) -> a valid str to use.
*/
function mapPathString(sourcePath, state) {
	sourcePath = sourcePath.replace(/\\/g, '/');
	
	// If we've got a filetype, check if it's a static file.
	var pathParts = sourcePath.split('/');
	
	// If we've got a filetype, check if it's a static file.
	var lastPart = pathParts[pathParts.length-1];
	var lastDot = lastPart.lastIndexOf('.');
	
	var isStaticFile = false;
	
	if(lastDot != -1){
		var fileType = lastPart.substring(lastDot + 1).toLowerCase();
		
		// True if it's a static file:
		isStaticFile = sourcePath.indexOf('/static/') != -1 || !nonStaticFileTypes[fileType];
	}
	
	if(sourcePath.startsWith('.')){
		// Relative filesystem path.
		var pathParts = sourcePath.split('/');
		
		var builtPath = (isStaticFile ? state.filePathParts : state.modulePathParts).slice(0);
		
		for(var i=0;i<pathParts.length;i++){
			var pathPart = pathParts[i];
			if(pathPart == '.'){
				// Just ignore this
			}else if(pathPart == '..'){
				builtPath.pop();
			}else{
				builtPath.push(pathPart);
			}
		}
		
		sourcePath = builtPath.join('/');
		lastDot = builtPath[builtPath.length-1].lastIndexOf('.');
		
		if(state.relativeRequires){
			state.relativeRequires.push(sourcePath);
		}
	} else if(!sourcePath.startsWith("s:") && !sourcePath.startsWith("UI/") && !sourcePath.startsWith("Email/") && !sourcePath.startsWith("Admin/")) {
		// npm - prepend:
		state.npmPackages[sourcePath]=1;
		return "Npm/" + sourcePath; 
	}	
	
	if(isStaticFile){
		// Use a ref:
		return 's:' + sourcePath.toLowerCase();
	}
	
	// Drop the filetype if there was one.
	if(lastDot == -1){
		return sourcePath;
	}
	
	return sourcePath.substring(0, sourcePath.lastIndexOf('.'));
}

function transformImport(nodePath, state) {
	var src = nodePath.node.source;
	const sourcePath = src.value.replace(/\\/g, '/');
	
	// Require statement will be:
	var importedFrom = mapPathString(sourcePath, state);
	
	var specifiers = nodePath.node.specifiers;
	
	if(importedFrom.startsWith('s:')){
		// static ref. Literally just var = "the string ref";
		
		var targetLocal = specifiers[0].local;
		
		nodePath.replaceWith(
			state.types.variableDeclaration("var", [state.types.variableDeclarator(targetLocal, state.types.stringLiteral(importedFrom))])
		);
		
		return;
	}
	
	var requireStatement;
	
	if(sourcePath == "react"){
		// Special case - map to global.React:
		requireStatement = state.types.memberExpression(state.types.identifier("global"), state.types.identifier('React'));
	}else{
		requireStatement = state.types.callExpression(
			state.types.identifier("_rq"),
			[state.types.stringLiteral(importedFrom)]
		);
	}
	
	if(specifiers && specifiers.length){
		
		if(specifiers.length == 1){
			// If there is a default specifier only, then output it as a simple const set. Note that we do not support module.exports={}; as 'default' here. That must be transformed on the export side.
			
			// import thing from 'x';
			// const thing=_rq('x').default;
			
			// import * as thing from 'x';
			// const thing=_rq('x');
			
			// import {thing as somethingElse} from 'x';
			// const somethingElse=_rq('x').thing;
			
			var result;
			
			if(state.types.isImportDefaultSpecifier(specifiers[0])){
				
				// Default. Uses a field called 'default' specifically.
				// Note that for modules that set e.g. a function to module.exports, it's remapped on the export side.
				result = state.types.variableDeclaration("const", [
					state.types.variableDeclarator(specifiers[0].local, state.types.memberExpression(requireStatement, state.types.identifier('default')))
				]);
				
			}else if(state.types.isImportNamespaceSpecifier(specifiers[0])){
				// import * as x from 'y';
				
				// This is just everything:
				result = state.types.variableDeclaration("const", [state.types.variableDeclarator(specifiers[0].local, requireStatement)]);
				
			}else{
				result = state.types.variableDeclaration("const", [state.types.variableDeclarator(specifiers[0].local, state.types.memberExpression(requireStatement, specifiers[0].imported))]);
			}
			
			nodePath.replaceWith(
				result
			);
		}else{
			
			// Convert them to an object specifier.
			var specifierFields = [];
			for(var i=0;i<specifiers.length;i++){
				var spec = specifiers[i];
				var isDefault = state.types.isImportDefaultSpecifier(spec);
				specifierFields.push(state.types.objectProperty(isDefault ? state.types.identifier('default') : specifiers[i].imported, specifiers[i].local, false, true));
			}
			
			var result = state.types.variableDeclaration("const", [state.types.variableDeclarator(state.types.objectPattern(specifierFields), requireStatement)]);
			
			nodePath.replaceWith(
				result
			);
		}
		
	}else{
		// Just a require which executes on run. Actual return value is not used.
		
		// state.types.variableDeclaration("var", [state.types.variableDeclarator(targetLocal, state.types.stringLiteral(targetUrl))]);
		
		nodePath.replaceWith(
			requireStatement
		);
	}
	
}

function toExpression(declaration, state){
	if(state.types.isFunctionDeclaration(declaration)){
		return state.types.functionExpression(
			declaration.id,
			declaration.params,
			declaration.body,
			declaration.generator,
			declaration.async
		);
	}else if(state.types.isClassDeclaration(declaration)){
		return state.types.classExpression(
			declaration.id,
			declaration.superClass,
			declaration.body,
			declaration.decorators
		);
	}
	
	// Ok anyway - is an expr:
	return declaration;
}

function transformExport(nodePath, state) {
	
	if(nodePath.node.declaration && nodePath.node.declaration.type.startsWith('TS')){
		// Typescript export type declaration.
		return;
	}
	
	// From babel docs, can be any of: FunctionDeclaration | TSDeclareFunction | ClassDeclaration | Expression
	// Declarations must be converted to an expression first.
	if(state.types.isExportNamedDeclaration(nodePath)){
		// export function test(){}; or export {test, other}; or export class Test{}.
		
		var declaration = nodePath.node.declaration;
		
		if(declaration){
			
			if(state.types.isVariableDeclaration(declaration)){
				// Can export multiple variable declarations.
				
				var thingsExported = nodePath.node.declaration.declarations;
			
				var replacement = [];
				
				for(var i=0;i<thingsExported.length;i++){
					var thingExported = thingsExported[i];
					
					if(state.types.isObjectPattern(thingExported.id)){
						// Destructuring inside an export statement.
						// export const {a,b} = thing;
						// Note that multiple can be exported together, thus the loop:
						// export const {a,b} = thing, anotherThing="";
						throw new Error("Object destructuring - that's e.g. 'export const {a,b} = thing;' - in an export statement is not currently supported by the Socialstack bundler. If you'd like it, do say!");
					}
					
					replacement.push(
						state.types.expressionStatement(
							state.types.assignmentExpression(
								'=',
								state.types.memberExpression(
									state.types.identifier("exports"),
									state.types.identifier(thingExported.id.name) // must make a new identifier to avoid it mangling the exported name
								),
								thingExported.init
							)
						)
					);
				}
				
				nodePath.replaceWithMultiple(replacement);
			}else{
				// Functions and classes being exported via export function test(){};
				nodePath.replaceWithMultiple(
					[
						// The func/ class:
						declaration,
						
						// The exports line:
						state.types.expressionStatement(
							state.types.assignmentExpression(
								'=',
								state.types.memberExpression(
									state.types.identifier("exports"),
									state.types.identifier(declaration.id.name)
								),
								declaration.id
							)
						)
					]
				);
			}
		}else{
			// export LOCAL;
			// export LOCAL as REMOTE;
			// export LOCAL from 'source';
			
			var replacement = [];
			var thingsExported = nodePath.node.specifiers;
			
			if(nodePath.node.source){
				// export X from 'source';
				
				// Require statement will be:
				var importedFrom = mapPathString(nodePath.node.source.value.replace(/\\/g, '/'), state);
				
				if(importedFrom.startsWith('s:')){
					// export MyImage from './test.jpg';
					
					var targetExport = thingsExported[0].exported.name;
					
					replacement.push(
						state.types.expressionStatement(
							state.types.assignmentExpression(
								'=',
								state.types.memberExpression(
									state.types.identifier("exports"),
									state.types.identifier(targetExport)
								),
								state.types.stringLiteral(importedFrom)
							)
						)
					);
				}else{
					// some other module. Require it first:
					var requireStatement = state.types.expressionStatement(
						state.types.assignmentExpression(
							'=',
							state.types.identifier("_eI"),
							state.types.callExpression(
								state.types.identifier("_rq"),
								[state.types.stringLiteral(importedFrom)]
							)
						)
					);
					
					replacement.push(requireStatement);
					
					for(var i=0;i<thingsExported.length;i++){
						var thingExported = thingsExported[i];
						var name = thingExported.exported.name;
						
						replacement.push(
							state.types.expressionStatement(
								state.types.assignmentExpression(
									'=',
									state.types.memberExpression(
										state.types.identifier("exports"),
										state.types.identifier(name)
									),
									state.types.memberExpression(
										state.types.identifier("_eI"),
										thingExported.local
									)
								)
							)
						);
					}
					
				}
				
			}else{
				for(var i=0;i<thingsExported.length;i++){
					var thingExported = thingsExported[i];
					
					var name = thingExported.exported.name;
					thingExported = thingExported.local;
					
					replacement.push(
						state.types.expressionStatement(
							state.types.assignmentExpression(
								'=',
								state.types.memberExpression(
									state.types.identifier("exports"),
									state.types.identifier(name)
								),
								toExpression(thingExported, state)
							)
						)
					);
				}
			}
			
			nodePath.replaceWithMultiple(replacement);
		}
		
	}else if(state.types.isExportDefaultDeclaration(nodePath)){
		// export default function(){ .. } or class etc.
		var thingExported = nodePath.node.declaration;
		
		if(thingExported.id){
			// not an anonymous func
			nodePath.replaceWithMultiple(
				[
					thingExported,
					state.types.expressionStatement(
						state.types.assignmentExpression(
							'=',
							state.types.memberExpression(
								state.types.identifier("exports"),
								state.types.identifier("default")
							),
							thingExported.id
						)
					)
				]
			);
		}else{
			// Anon func
			
			var expr = toExpression(thingExported, state);
		
			nodePath.replaceWith(
				state.types.assignmentExpression(
					'=',
					state.types.memberExpression(
						state.types.identifier("exports"),
						state.types.identifier("default")
					),
					expr
				)
			);
		}
	}else if(state.types.isExportAllDeclaration(nodePath)){
		throw new Error("Export * not currently supported by the Socialstack bundler. If you'd like it, do say!");
	}
}

function stripPropTypesAndIcon(nodePath, state) {
	// Removes Thing.propTypes={..} and Thing.icon={..}
	// This happens if:
	// * It's an assignment expression
	// * In the root scope of the module
	// * Min build
	// * Frontend (Not admin).    TODO!
	
	if(
		nodePath.node && 
		nodePath.node.property && 
		(nodePath.node.property.name == "propTypes" || nodePath.node.property.name == "icon") && 
		state.types.isAssignmentExpression(nodePath.parentPath.node) && 
		state.types.isExpressionStatement(nodePath.parentPath.parentPath.node)  && 
		state.types.isProgram(nodePath.parentPath.parentPath.parentPath.node) 
	){
		nodePath.parentPath.remove();
		
		// Store it in a stub meta file alongside original.
	}
	
}

function trackTemplateLiteral(nodePath, state){
	var node = nodePath.node;
	
	// ignore child template literals inside ${expressions}.
	nodePath.skip();
	
	// Expressions in the template literal.
	// If they are complex expressions beyond simple memberExpression or local vars, 
	// we skip this template literal and mark it as such.
	var expressions = [];
	
	if(node.expressions && node.expressions.length){
		// It has some expressions in it. If they're anything other than an Identifier or MemberExpression, this tl can't be localised.
		for(var i=0;i<node.expressions.length;i++){
			
			var expr = node.expressions[i];
			
			if(!state.types.isIdentifier(expr) && !state.types.isMemberExpression(expr)){
				// Can't use this template literal.
				// The output scan will still encounter it though, so it needs to know that it should be skipped.
				// Push a null to indicate it:
				state.templateLiteralSet.push({original: null, expressions: [], sort: node.start+1});
				return;
			}
			
			var from = state.file.code.substring(expr.start, expr.end);
			expressions.push({from, to: from});
		}
	}
	
	// add to array:
	var literalSource = state.file.code.substring(node.start+1, node.end-1);
	
	state.templateLiteralSet.push({original: literalSource, expressions, sort: node.start+1});
}

function createPlugin(minified){
	
	var visitor = {
		Program: {
			exit(programPath, state) {
				state.filePathParts = this.opts.fullModulePath.split('/');
				state.npmPackages = this.opts.npmPackages;
				state.relativeRequires = this.opts.relativeRequires;
				state.modulePathParts = this.opts.moduleName.split('/');
				
				if(state.modulePathParts.length && state.modulePathParts[state.modulePathParts.length-1].indexOf('.') != -1){
					// The last piece is a file - pop it for relative paths:
					state.modulePathParts.pop();
				}
				
				state.templateLiteralSet = this.opts.templateLiterals;
				
				programPath.traverse({
					'ImportDeclaration': transformImport,
					'ExportDeclaration': transformExport,
					// 'MemberExpression': stripPropTypesAndIcon,
					'TemplateLiteral': trackTemplateLiteral,
				}, state);
				
				// Wrap it with a module function.
				var functionBody = state.types.blockStatement(
					programPath.node.body
				);
				
				var funcArgs = [
					state.types.identifier("global"),
					state.types.identifier("exports")
				];
				
				if(this.opts.commonJs){
					funcArgs.push(state.types.identifier("module"));
				}
				
				/*
				var functionExpr = state.types.functionExpression(
					null,
					[
						state.types.identifier("global"),
						state.types.identifier("exports"),
						state.types.identifier("module")
					],
					functionBody
				);
				*/
				
				var modName = this.opts.moduleName;
				var modNameDot = modName.lastIndexOf('.');
				
				if(modNameDot != -1){
					modName = modName.substring(0, modNameDot);
				}
				
				var assignment = state.types.assignmentExpression(
					'=',
					// __mm['Module/Path']
					state.types.memberExpression(
						state.types.identifier("__mm"),
						state.types.stringLiteral(modName),
						true
					),
					
					// function(global,exports){
					state.types.functionExpression(
						null,
						funcArgs,
						functionBody
					)
				);
				
				var statement = state.types.expressionStatement(assignment);
				
				programPath.node.body = [statement];
			},
			/*
			exit(programPath, state) {
				programPath.traverse(importVisitors, state);
			},
			*/
		},
	};
	
	return ({ types }) => ({
		name: 'module-resolver',
		pre(file) {
			this.types = types;
		},
		visitor,
		post() {
		},
	});
}

var configuredMangleNames = [mangleNames, {exclude: {'_h': true}}];
var minifiedPlugin = createPlugin(true);
var nonMinifiedPlugin = createPlugin(false);

var presetsES8 = [
	[presetEnv, {targets:{chrome: 60}, modules: false}],
	[presetTs, {isTSX: true, allExtensions: true}],
	[presetReact, {useSpread: true, pragma: '_h'}]
];

var presetsES5 = [
	[presetEnv, {targets:{ie: 10}, modules: false}],
	[presetTs, {isTSX: true, allExtensions: true}],
	[presetReact, {useSpread: true, pragma: '_h'}]
];

function transformES8(code, moduleName, fullModulePath, opts){
	var templateLiterals = []; // Each entry is added as {original: 'original ${source}'}
	var npmPackages = {};
	var relativeRequires = opts.outputRelativeRequires ? [] : null;
	
	// Each time a template literal is encountered, its original source text is added to the array.
	// If there were any, the output code is parsed again to store the exact location that it ultimately ended up in (just by order, as it would always be the same).
	// This is also important for minified mode, as it needs to know what it was minified to.
	
	var pluginConfig = {
		moduleName,
		fullModulePath,
		templateLiterals,
		npmPackages,
		relativeRequires,
		commonJs: opts ? opts.commonJs : false
	};
	
	var minified = opts ? opts.minified : false;
	
	var src = babelCore.transformSync(
		code,
		{
			filename: moduleName,
			presets: presetsES8,
			caller: {
				name: 'es8'
			},
			plugins: minified ? [[minifiedPlugin, pluginConfig], configuredMangleNames] : [[nonMinifiedPlugin, pluginConfig]],
			comments: false,
			minified: minified
		}
	).code;
	
	if(templateLiterals.length){
		// Parse src, looking for them in the output to retain their exact location (and final output text).
		templateLiterals = locateTemplateLiterals(src, templateLiterals);
	}
	
	var result = {
		src,
		templateLiterals,
		npmPackages
	};
	
	if(relativeRequires){
		result.relativeRequires = relativeRequires;
	}
	
	return result;
}

function transformES5(code, moduleName, fullModulePath, opts){
	var templateLiterals = []; // Each entry is added as {original: 'original ${source}'}
	var npmPackages = {};
	var relativeRequires = opts.outputRelativeRequires ? [] : null;
	
	// Each time a template literal is encountered, its original source text is added to the array.
	// If there were any, the output code is parsed again to store the exact location that it ultimately ended up in (just by order, as it would always be the same).
	// This is also important for minified mode, as it needs to know what it was minified to.
	
	var pluginConfig = {
		moduleName,
		fullModulePath,
		templateLiterals,
		npmPackages,
		relativeRequires,
		commonJs: opts ? opts.commonJs : false
	};
	
	var minified = opts ? opts.minified : false;
	
	var src = babelCore.transformSync(
		code,
		{
			filename: moduleName,
			presets: presetsES5,
			caller: {
				name: 'es5',
				moduleName,
				fullModulePath,
				custom: {
					templateLitrSet : templateLiterals
				}
				
			},
			plugins: minified ? [[minifiedPlugin, pluginConfig], configuredMangleNames] : [[nonMinifiedPlugin, pluginConfig]],
			comments: false,
			minified: minified
		}
	).code;
	
	if(templateLiterals.length){
		// Parse src, looking for them in the output to retain their exact location (and final output text).
		templateLiterals = locateTemplateLiterals(src, templateLiterals);
	}
	
	var result = {
		src,
		templateLiterals,
		npmPackages
	};
	
	if(relativeRequires){
		result.relativeRequires = relativeRequires;
	}
	
	return result;
}

function peekString(str, index){
	return (index>=str.length) ? undefined : str[index];
}

function findExpressionEnd(str, index){
	var depth = 0;
	var mode = 0;
	
	for(var i=index;i<str.length;i++){
		var chr = str[i];
		
		if(mode == 1){
			// 'string'
			if(chr == '\\' && peekString(str, i+1) == '\''){
				// Escaped end quote
				i++;
			}else if(chr == '\''){
				// exited string
				mode = 0;
			}
		}else if(mode == 2){
			// "string"
			if(chr == '\\' && peekString(str, i+1) == '"'){
				// Escaped end quote
				i++;
			}else if(chr == '"'){
				// exited string
				mode = 0;
			}
		}else if(mode == 3){
			// line comment
			if(chr == '\n' || chr == '\r'){
				// Exited comment
				mode = 0;
			}
		}else if(mode == 4){
			// block comment
			if(chr == '\*' && peekString(str, i+1) == '/'){
				// Exited comment
				mode = 0;
			}
		}else if(mode == 5){
			// Inside template literal.
			if(chr == '$' && peekString(str, i+1) == '{'){
				// Entering an expression.
				// Almost anything can go inside an expression - including entire functions, comments etc.
				i = findExpressionEnd(str, i+2)-1;
				continue;
			}else if(chr == '\\' && peekString(str, i+1) == '`'){
				// Escaped end quote
				i++;
			}else if(chr == '`'){
				// exited
				mode = 0;
			}
		}else if(chr == '\''){
			mode = 1;
		}else if(chr == '\"'){
			mode = 2;
		}else if(chr == '/' && peekString(str, i+1) == '/'){
			mode = 3;
		}else if(chr == '/' && peekString(str, i+1) == '*'){
			mode = 4;
		}else if(chr == '\\' && peekString(str, i+1) == '/'){ // can occur in a regex
			i++;
		}else if(chr == '`'){
			// _another_ template literal (they can nest).
			mode = 5;
			
		}else if(chr == '{'){
			depth++;
		}else if(chr == '}'){
			if(depth <= 0){
				// found the terminal.
				return i;
			}else{
				// nested bracket.
				depth--;
			}
		}
	}
}

function locateTemplateLiterals(str, literals){
	var resultSet = [];
	
	// Must sort literals by the order they occur in the source (the sort field), as the AST visit order is not the same as the order they will be/ were in the actual source:
	literals.sort((a,b) => (a.sort > b.sort) ? 1 : ((b.sort > a.sort) ? -1 : 0));
	
	var currentLiteralIndex = 0;
	var currentLiteral = null;
	var mode = 0;
	var exprIndex = 0;
	
	for(var i=0;i<str.length;i++){
		var chr = str[i];
		
		if(mode == 1){
			// 'string'
			if(chr == '\\' && peekString(str, i+1) == '\''){
				// Escaped end quote
				i++;
			}else if(chr == '\''){
				// exited string
				mode = 0;
			}
		}else if(mode == 2){
			// "string"
			if(chr == '\\' && peekString(str, i+1) == '"'){
				// Escaped end quote
				i++;
			}else if(chr == '"'){
				// exited string
				mode = 0;
			}
		}else if(mode == 3){
			// line comment
			if(chr == '\n' || chr == '\r'){
				// Exited comment
				mode = 0;
			}
		}else if(mode == 4){
			// block comment
			if(chr == '\*' && peekString(str, i+1) == '/'){
				// Exited comment
				mode = 0;
			}
		}else if(mode == 5){
			// Inside template literal.
			if(chr == '$' && peekString(str, i+1) == '{'){
				// Entering an expression.
				// Almost anything can go inside an expression - including entire functions, comments etc.
				var exprStart = i+2;
				i = findExpressionEnd(str, exprStart)-1;
				
				// target expression text was..
				var expressionText = str.substring(exprStart, i+1);
				
				if(exprIndex < currentLiteral.expressions.length){
					var expr = currentLiteral.expressions[exprIndex];
					expr.to = expressionText;
					exprIndex++;
				}
				
				continue;
			}else if(chr == '\\' && peekString(str, i+1) == '`'){
				// Escaped end quote
				i++;
			}else if(chr == '`'){
				// exited
				currentLiteral.end = i;
				currentLiteral.target = str.substring(currentLiteral.start, currentLiteral.end);
				mode = 0;
			}
		}else if(chr == '\''){
			mode = 1;
		}else if(chr == '\"'){
			mode = 2;
		}else if(chr == '/' && peekString(str, i+1) == '/'){
			mode = 3;
		}else if(chr == '/' && peekString(str, i+1) == '*'){
			mode = 4;
		}else if(chr == '\\' && peekString(str, i+1) == '/'){ // can occur in a regex
			i++;
		}else if(chr == '`'){
			// template literal! This is what we're really after.
			
			if(currentLiteralIndex >= literals.length){
				currentLiteral = {original: null, expressions: []};
			}else{
				currentLiteral = literals[currentLiteralIndex];
			}
			
			currentLiteral.start = i+1;
			currentLiteralIndex++;
			
			mode = 5;
			exprIndex = 0;
		}
	}
	
	// Finally we'll respond with a stripped back set.
	// Specifically, we're stripping out any complex template literals (ones which have complex expressions in them) which cannot be translated or used in any other meaningful way.
	// Complex ones existed in the array at all such that our above order based scan is not thrown off.
	return literals.filter(lit => lit.original != null && lit.target != null);
}

module.exports = {transformES8, transformES5};