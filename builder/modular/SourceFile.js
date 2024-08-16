var fs = require('fs');


class SourceFile
{
	constructor(){
		this.priority = 100;
	}
	
	/// <summary>
	/// Loads this files textual content into "this.content".
	/// </summary>
	loadTextContent(){
		return this.loadTextFile(this.path).then(content => {
			this.content = content;
		});
	}
	
	/// <summary>
	/// Loads a text file at the given path, in utf8. It can also have a BOM.
	/// </summary>
	loadTextFile(path) {
		return new Promise((s, r) => {
			
			fs.readFile(path, {encoding: 'utf8'}, function(err, fileContent){
				if(err){
					return r(err);
				}
				
				// drop the BOM
				if (fileContent.length && fileContent.charCodeAt(0) === 0xFEFF) {
					fileContent=fileContent.slice(1);
				}
				
				s(fileContent);
			});
			
		});
	}
	
	
	/*
	/// <summary>
	/// Sort order of SCSS files.
	/// </summary>
	public int Priority = 100;
	/// <summary>
	/// Same as the key in the FileMap.
	/// </summary>
	public string Path;
	/// <summary>
	/// Name of file incl type.
	/// </summary>
	public string FileName;
	/// <summary>
	/// Module path for this file. It's essentially the path but always uses / and never contains "ThirdParty" or bundles.
	/// </summary>
	public string ModulePath;
	/// <summary>
	/// Module path for this file. It's essentially the path but always uses /. This one does contain ThirdParty and bundles, however.
	/// </summary>
	public string FullModulePath;
	/// <summary>
	/// Tidy file type.
	/// </summary>
	public SourceFileType FileType;
	/// <summary>
	/// True if this file is a "global" one. Only true for SCSS files with .global. in their filename.
	/// </summary>
	public bool IsGlobal;
	/// <summary>
	/// Lowercase filetype. "js", "jsx" etc.
	/// </summary>
	public string RawFileType;
	/// <summary>
	/// Relative to the Source directory in the parent builder.
	/// </summary>
	public string RelativePath;
	/// <summary>
	/// True if this file is a ThirdParty one.
	/// </summary>
	public bool ThirdParty;
	/// <summary>
	/// Raw file content, set once loaded.
	/// </summary>
	public string Content;
	/// <summary>
	/// The contents of this file, transpiled. If it's a format that doesn't require transpiling, then this is null.
	/// </summary>
	public string TranspiledContent;
	/// <summary>
	/// Set if this file failed to build.
	/// </summary>
	public UIBuildError Failure;
	/// <summary>
	/// Any template literals in this JS file.
	/// </summary>
	public List<TemplateLiteral> Templates;
	*/
}

module.exports = SourceFile;