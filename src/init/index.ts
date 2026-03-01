import { SocialStackConfig } from '../types';
import mod_0gx1u from '../create/helpers.js';
const { installDatabase   } = mod_0gx1u;

export default (config: SocialStackConfig) => {
	
	installDatabase(config).then(() => {
		console.log('Done');
	}).catch(e => {
		
		if(e && e.message){
			console.error(e.message);
		}else{
			console.error(e);
		}
		
	});
	
};