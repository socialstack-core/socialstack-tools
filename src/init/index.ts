import { SocialStackConfig } from '../types';
import createHelpers from '../create/helpers.js';
const { installDatabase } = createHelpers;

export default (config: SocialStackConfig) => {

	installDatabase(config).then(() => {
		console.log('Done');
	}).catch(e => {

		if (e && e.message) {
			console.error(e.message);
		} else {
			console.error(e);
		}

	});

};