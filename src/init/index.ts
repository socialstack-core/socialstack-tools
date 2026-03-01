

import { SocialStackConfig } from '../types';
import { installDatabase } from '../create/helpers.ts';

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