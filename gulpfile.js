/*
* KSN gulp helper. Makes using webpack super straight forward.
* This just requires a config.js file in _sub projects_.
* A sub project is simply any folder alongside the folder that this is running from.
*/

var fs = require("fs");
var path = require('path');

var gulp = require("gulp");
var gutil = require("gulp-util");
var webpack = require("webpack");
var CompressionPlugin = require('compression-webpack-plugin');
// var HtmlWebpackPlugin = require('html-webpack-plugin');
var Visualizer = require('webpack-visualizer-plugin');
var MiniCssExtractPlugin = require("mini-css-extract-plugin");
var swPreload = require("sw-precache");

function webpackPath(dir, settings){
	return settings.subdirectory ? path.resolve(dir, 'public', settings.subdirectory, 'pack') : path.resolve(dir, 'public', 'pack');
}

/*
* Webpack config generation method.
* Takes in some greatly simplified config and outputs the complete webpack config to match.
*/
function webpackConfig(dir, production, settings) {
	if (production) {
		process.env.NODE_ENV = process.env.ENV = 'production';
	}
	
	var aliases = {
		modules: [
			'node_modules',
			'static'
		],
		alias: {
			'@form': path.resolve(dir, 'Source', 'Modules', 'form.js'),
			'@dispatch': path.resolve(dir, 'Source', 'Modules', 'dispatch.js'),
			'@component': path.resolve(dir, 'Source', 'Components'),
			'@page': path.resolve(dir, 'Source', 'Pages'),
			'@module': path.resolve(dir, 'Source', 'Modules'),
			'@api': path.resolve(dir, 'Source', 'Modules', 'apiEndpoint.js'),
			'@app': path.resolve(dir, 'Source', 'Modules', 'appEndpoint.js')
		}
	};

	var config = {
		
		entry: path.resolve(dir, 'Source', 'client.js'),
		resolve: aliases,
		mode: production ? 'production' : 'development',
		module: {
			rules: [
				{
					test: /\.jsx?$/,
					exclude: /node_modules/,
					use: ['babel-loader?' + JSON.stringify(babelrc)]
				},
				{
					test: /\.(woff2?|ttf|eot|svg|otf)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
					use: 'file-loader'
				},
				{
					test: /\.(jpeg|jpg|gif|png|tiff)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
					use: 'url-loader?limit=5000&name=img/img-[hash:6].[ext]'
				},
				{
					test: /\.(sa|sc|c)ss$/,
					use: [
						{
							loader: MiniCssExtractPlugin.loader,
							options: {
								publicPath: ''
							}
						},
						{loader: 'css-loader'},
						// {loader: 'postcss-loader', options: {options: {}}},
						{loader: 'sass-loader'},
					],
				}
			]
		},
		optimization: {
			minimize: production
		},
		output: {
			filename: '[name].generated.js',
			libraryTarget: 'this',
			path: webpackPath(dir, settings),
			publicPath: settings.subdirectory ? './' + settings.subdirectory + '/pack/' : './pack/'
		},
		plugins: [
			new MiniCssExtractPlugin({
			  // Options similar to the same options in webpackOptions.output
			  // both options are optional
			  filename: "styles.css"
			}),
			new webpack.DefinePlugin({
				'process.env': {
					NODE_ENV: '"' + process.env.ENV + '"'
				},
				__CLIENT__: true,
				__SERVER__: false
			})
			/*
			new HtmlWebpackPlugin({
				template: 'Assets/index.html'
			})
			*/
		]
	};

	if (production) {
		// - Extra production settings -

		config.plugins.push(
			new webpack.optimize.OccurrenceOrderPlugin()
		);
		
		config.plugins.push(
			new CompressionPlugin({
				filename(info) {
					return "../compressed/" + info.path + ".gz" + info.query;
				},
				algorithm: "gzip",
				test: /\.js$|\.css$|\.html$/,
				threshold: 10240,
				minRatio: 0.8
			})
			// new Visualizer()
		);
	
	} else {
		// - Extra dev settings -
	
		/*
		config.devtool = 'source-map';
	
		config.devServer: {
			contentBase: path.join(__dirname, 'pack'),
			compress: true,
			port: 9000
		}
		*/

	}

	return config;
};

// Set to false if a non-prod build should be created.
var production = true;

// The babel config:
var babelrc = {
  "presets": [ "react", "es2015", "stage-0" ],
  "plugins": [ "transform-decorators-legacy" ],
	"compact": "true"
};

// Subprojects which use webpack:
var webpackProjects = [];

function checkForTasks(name){
	// First need to see if it's a directory:
	var dir = __dirname + '../' + name;
	
	var stat = fs.statSync(dir);
	
	if(stat.isDirectory()){
		// Ok - now just read config.js:
		dir+='/';
		
		var cfgPath = dir + 'config.js';
		
		if(!fs.existsSync(cfgPath)){
			// Doesn't have one.
			return;
		}
		
		// Get the config now:
		var cfg = require(dir + 'config.js');
		
		if(cfg.pack || cfg.pwa){
			// This subproject uses webpack. Define both a build-NAME and watch handler.
			var buildTaskName = "build-" + name;
			
			gulp.task(buildTaskName, gulp.series(
				function (done) {
					if (!cfg.__webpackCompiler) {
						cfg.__webpackConfig = webpackConfig(dir, production, cfg);
						cfg.__webpackCompiler = webpack(cfg.__webpackConfig);
					}
					
					console.log('production=' + production);
					
					cfg.__webpackCompiler.run(function (err, stats) {
						if (err) throw new gutil.PluginError("build-" + name, err);
						gutil.log("[build-" + name + "]",
							stats.toString({
								colors: true,
								chunks: false
							}));
						
						if(cfg.pwa){
							// Next, generate the service worker for the PWA (sw.js):
							
							var swDir = path.resolve(dir, 'public');
							
							var swPreloadOptions = {
								
								staticFileGlobs: [
									swDir + '/pack/**/*',
									swDir + '/index.html'
								],
								maximumFileSizeToCacheInBytes: cfg.maximumFileSizeToCacheInBytes || 10000000, // 10mb approx
								stripPrefix: swDir.replace(/\\/g, '/') + '/',
								runtimeCaching: [{
								  urlPattern: /v1/, // API endpoints are always network first.
								  handler: 'networkFirst'
								}, {
								  urlPattern: /\/content\//, // Content directory is generally dynamic.
								  handler: 'fastest',
								  options: {
									cache: {
									  maxEntries: 100,
									  name: 'content-cache'
									}
								  }
								}],
								verbose: false
							};
							
							// Generate the PWA service worker:
							swPreload.write(dir + 'public/sw.js', swPreloadOptions, done);
							
						}else{
							done();
						}
					});
				}
			));
			
			// Add to webpack projects set:
			webpackProjects.push({
				buildTaskName,
				resultPath: webpackPath(dir, cfg),
				watchTask: () => gulp.watch(["../" + name + "/Source/**/*"], gulp.series(buildTaskName))
			});
			
			
		}
	}
}

module.exports = (dirname) => {
	dirname+="/";
	// NB: This assumes that we're cd'd to given dirname anyway.
	__dirname = dirname;
	
	// Find all sub-projects that have a config.js file:
	var files = fs.readdirSync(dirname + "..");
	files.forEach(file => checkForTasks(file));
	
	if(webpackProjects.length > 0){
		
		// Simply sets prod to false:
		gulp.task("not-production", gulp.series(
			function (done) {
				production = false;
				done();
			}
		));
		
		// Builds everything
		gulp.task("build-all",gulp.parallel(
			webpackProjects.map(cfg => cfg.buildTaskName)
		));

		// Watches all webpack sub-projects for changes:
		gulp.task("watch",
			gulp.series(
			["not-production", "build-all"],
			function (done) {
				webpackProjects.forEach(project => project.watchTask());
				done();
			}
		));
	}
	
}