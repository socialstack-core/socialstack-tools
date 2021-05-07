var sass = require('sass');


function transform(code, minify){
	
	var css = sass.renderSync({
		  data: code,
		  outputStyle: minify ? 'compressed' : undefined
		}).css.toString();
	
	// drop the BOM
	if (css.length && css.charCodeAt(0) === 0xFEFF) {
		css=css.slice(1);
	}
	
	return css;
}

module.exports = { transform };