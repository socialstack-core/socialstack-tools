module.exports = config => {
	console.log('');
	console.log('  ____    ____      __  __    _____  ');
	console.log(' / __"| u/ __"| u U|\' \\/ \'|u |" ___| ');
	console.log('<\\___ \\/<\\___ \\/  \\| |\\/| |/U| |_  u ');
	console.log(' u___) | u___) |   | |  | | \\|  _|/  ');
	console.log(' |____/>>|____/>>  |_|  |_|  |_|     ');
	console.log('  )(  (__))(  (__)<<,-,,-.   )(\\\\,-  ');
	console.log(' (__)    (__)      (./  \\.) (__)(_/  ');
	console.log('');
	console.log('Socialstack Migration Framework - Make Migrations Fun Again');
    console.log('');
var readline = require('readline');
var newConfiguration = {};

if(config.commandLine['from']){
	// E.g. socialstack migrate -from wordpress
	newConfiguration.from = config.commandLine.from;
}

function askFor(text, configName, cb){
	return new Promise((success, reject) => {
		
		if(newConfiguration[configName]){
			// Already set - skip.
			return success(newConfiguration, configName, newConfiguration[configName]);
		}
		
		console.log(text);
		
		var rl = readline.createInterface(process.stdin, process.stdout);
		rl.setPrompt(configName + ': ');
		rl.prompt();
		rl.on('line', function(line) {
			newConfiguration[configName] = line;
			rl.close();
			success(newConfiguration, configName, line);
		});	
	});
}

askFor('What are you migrating from? E.g. telligent, umbraco, sitecore, wordpress etc. If you enter a platform we\'ve not seen before we\'ll also check your preferred repository for shared migration helper modules too.', 'from').then(
	cfg => {
		return askFor('As this is the first time you\'ve ran the migration helper for Wordpress, we\'ll need either a dumped database, or ideally the FTP and database connection details.'+
		' If you provide connection details, we can perform high speed delta migrations after the first one. Which route would you like?\r\n\r\n1: Connection\r\n2: Dump\r\n', 'route')
	}
)
	
};