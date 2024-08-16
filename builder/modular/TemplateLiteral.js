/// <summary>
/// Information about a template literal.
/// </summary>
class TemplateLiteral
{
	/*
	/// <summary>
	/// Module name for this template literal. E.g. "UI/Thing".
	/// </summary>
	public string module;
	/// <summary>
	/// Original template literal.
	/// </summary>
	public string original;
	/// <summary>
	/// The target template literal. This is only different from original if the file was minified.
	/// </summary>
	public string target;
	/// <summary>
	/// Start index.
	/// </summary>
	public int start;
	/// <summary>
	/// End index.
	/// </summary>
	public int end;
	/// <summary>
	/// If the template literal has variables in it, this maps original variables to target ones. It's null otherwise.
	/// This exists whenever a template literal has variables in it, even if it maps a->a (non-minified source), 
	/// because it verifies if the variables even exist to avoid outputting JS with syntax errors in the event that a translator typoed.
	/// </summary>
	public Dictionary<string, string> variableMap;
	*/
}

module.exports = TemplateLiteral;