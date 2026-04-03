import { SocialStackConfig } from '../types';
import { setupDatabaseFromAppsettings } from '../database/helpers';

export const run = async (config: SocialStackConfig) => {
    try {
        await setupDatabaseFromAppsettings(config.projectRoot);
        console.log('Done');
    } catch (e) {
        console.error(e.message || e);
    }
};
