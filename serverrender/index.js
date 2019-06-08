var renderToString = require('preact-render-to-string');

function loadFrontend(config){
	
	// The JS file is at..
	var jsFile = config.projectRoot + '/UI/public/pack/main.generated.js';
	
	// Go get the JS now (frontend will be set to whatever it exposes to the 'global' scope):
	var frontend = require(jsFile);
	
	frontend.title = '';
	
	frontend.location = {
		pathname: '/'
	};
	
	var _App = frontend.__mm['UI/Start/App.js'].call();
	var _Canvas = frontend.__mm['UI/Canvas/Canvas.js'].call();
	
	var appInstance = frontend.React.createElement(_App.default, null);
	
	return {
		window: frontend,
		App: appInstance,
		Canvas: _Canvas.default,
		React: frontend.React,
		Modules: frontend.__mm
	};
}

function getRenderer(config){
	
	// Load the frontend JS:
	var frontend = loadFrontend(config);
	var React = frontend.React;
	
	return {
		render: function(config){
			
			// Url/ Canvas are optional (use one or the other).
			
			frontend.window.location = {
				pathname: config.url
			};
			
			var html;
			
			if(config.canvas){
				var canvasInstance = frontend.React.createElement(frontend.Canvas, null, config.canvas);
				
				html = renderToString(
					canvasInstance
				);
				
			}else{
				
				// In the URL cases, we need to grab the canvas for the *page*.
				/*html = renderToString(
					canvasInstance
				);
				*/
				html = "Rendering URLs is not quite ready yet!";
			}
			
			return {
				html: html,
				meta: {
					title: frontend.window.title
				}
			};
		}
	};
	
}

module.exports = {
	
	getRenderer
	
};