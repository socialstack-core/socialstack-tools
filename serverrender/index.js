
function loadFrontend(config){
	
	// The JS file is at..
	var jsFile = config.projectRoot + '/UI/public/pack/main.generated.js';
	
	// Go get the JS now (frontend will be set to whatever it exposes to the 'global' scope):
	var frontend = require(jsFile);
	
	return {
		App:frontend.app,
		React: frontend.React,
		Modules: frontend.__mm
	};
}

function getRenderer(config){
	
	// Load the frontend JS:
	var frontend = loadFrontend(config);
	var React = frontend.React;
	
	return {
		render: function(url){
			
			/*
			// Use a html specific render function here
			// (This complains about document being undefined)
			return React.render(
				frontend.App
			);
			*/
			
			return '';
		}
	};
	
}

module.exports = {
	
	getRenderer
	
};