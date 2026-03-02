

import { SocialStackConfig } from '../types';
import { installDatabase } from '../create/helpers.js';

export const run = (config: SocialStackConfig) => {

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