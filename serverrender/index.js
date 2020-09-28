var fetch = require('node-fetch');
var fs = require('fs');
var renderToString = require('preact-render-to-string');

function loadFrontend(window, config){
	
	// The JS file is at..
	var jsFile = config.projectRoot + '/Admin/public/en-admin/pack/main.generated.js';
	
	try{
		// Go get the JS now:
		var jsFileContent = fs.readFileSync(jsFile, {encoding: 'utf8'});
		
		var __scope__ = {
			exports: window
		};
		
		eval('(function(module){' + jsFileContent + '})(__scope__)');
		
	}catch(e){
		console.log('[WARN] Your frontend JS fails to load: ', e);
		return {
			failed: e
		};
	}
	
	var _App = window.__mm['Admin/Start/App.js'].call();
	var _Canvas = window.__mm['UI/Canvas/Canvas.js'].call();
	
	return {
		window,
		App: _App.default,
		Canvas: _Canvas.default,
		React: window.React,
		Modules: window.__mm
	};
}

function getRenderer(config){
	
	// Try getting site config, so we know the absolute URL, name etc too:
	var appSettings;
	
	try{
		appSettings = require(config.projectRoot + '/appsettings.json');
	}catch(e){
		console.log(e);
	}
	
	var location = new URL(appSettings ? appSettings.BaseUrl || appSettings.PublicUrl : '');
	
	var pendingRequests = [];
	
	var window = {
		fetch: (...args) => {
			// Note: You must set into app state if you want to use this.
			// preact-render-to-string is stateless, so it ignores our setState calls in a webRequest().then(..).
			var promise = fetch(...args);
			pendingRequests.push(promise);
			return promise;
		},
		NaN: global.NaN,
		Infinity: global.Infinity,
		undefined: global.undefined,
		eval: global.eval,
		encodeURIComponent: global.encodeURIComponent,
		decodeURIComponent: global.decodeURIComponent,
		decodeURI: global.decodeURI,
		encodeURI: global.encodeURI,
		parseInt: global.parseInt,
		parseFloat: global.parseFloat,
		Boolean: global.Boolean,
		Function: global.Function,
		Array: global.Array,
		Int8Array: global.Int8Array,
		Uint8Array: global.Uint8Array,
		Uint8ClampedArray: global.Uint8ClampedArray,
		Int16Array: global.Int16Array,
		Uint16Array: global.Uint16Array,
		Int32Array: global.Int32Array,
		Uint32Array: global.Uint32Array,
		Float32Array: global.Float32Array,
		Float64Array: global.Float64Array,
		BigInt64Array: global.BigInt64Array,
		BigUint64Array: global.BigUint64Array,
		Map: global.Map,
		Set: global.Set,
		WeakMap: global.WeakMap,
		WeakSet: global.WeakSet,
		Promise: global.Promise,
		JSON: global.JSON,
		ArrayBuffer: global.ArrayBuffer,
		SharedArrayBuffer: global.SharedArrayBuffer,
		Atomics: global.Atomics,
		Intl: global.Intl,
		WebAssembly: global.WebAssembly,
		DataView: global.DataView,
		Symbol: global.Symbol,
		Object: global.Object,
		Error: global.Error,
		ReferenceError: global.ReferenceError,
		TypeError: global.TypeError,
		RangeError: global.RangeError,
		isNaN: global.isNaN,
		isFinite: global.isFinite,
		Date: global.Date,
		Math: global.Math,
		BigInt: global.BigInt,
		Number: global.Number,
		String: global.String,
		RegExp: global.RegExp,
		navigator: {
			userAgent: ''
		},
		title: '',
		location,
		document: {
			addEventListener: function(){},
			removeEventListener: function(){}
		},
		apiHost: 'http://localhost:5050'
	};
	
	// Load the JS:
	var frontend = loadFrontend(window, config);
	
	function renderWithFetch(canvasInstance, success){
		
		// Set global app state before rendering:
		window.app = canvasInstance.__app;
		
		// Attempt to render:
		var html = renderToString(
			canvasInstance
		);
		
		if(pendingRequests.length){
			
			// It made some web requests that we need to wait for.
			// Grab those and also reset the pendingRequests array for other render() calls:
			var promiseSet = pendingRequests;
			pendingRequests = [];
			
			Promise.all(promiseSet).then(() => {
				// All web requests completed.
				
				// They haven't ran their handlers yet though, so we must wait 1 tick first.
				setTimeout(function(){
					renderWithFetch(canvasInstance, success);
				}, 1);
			});
			
		}else{
			
			success({
				html,
				meta: {
					title: window.title
				}
			});
			
		}
		
	}
	
	return {
		render: function(canvasAndContext){
			
			var {canvas, context} = canvasAndContext;
			
			return new Promise((success, reject) => {
				
				if(frontend.failed){
					// JS is faulty. Fail gracefully now.
					return success({
						failed: 'Your JS throws errors, so we can\'t use it to e.g. render your emails: ' + frontend.failed,
						html: null,
						meta: {}
					});
				}
				
				var html;
				
				// Instance app:
				var appInstance = frontend.React.createElement(frontend._App, null);
				
				// Its state is the context:
				appInstance.state = context;
				
				// setState calls are immediate:
				appInstance.setState = (fields, cb) => {
					for(var f in fields){
						context[f] = fields[f];
					}
					cb && cb();
				};
				
				// Also instance the canvas:
				var canvasInstance = frontend.React.createElement(frontend.Canvas, null, canvas);
				canvasInstance.__app = appInstance;
				
				renderWithFetch(
					canvasInstance,
					success
				);
				
			});
			
		}
	};
	
}

module.exports = {
	
	getRenderer
	
};