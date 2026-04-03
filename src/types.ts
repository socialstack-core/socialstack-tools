export interface CliOptions {
    command: string;
    force?: boolean;
    prod?: boolean;
    minified?: boolean;
    noCache?: boolean;
    apiUrl?: string;
    instanceUrl?: string;
    noUI?: boolean;
    noApi?: boolean;
    noApp?: boolean;
    compress?: boolean;
    branch?: string;
    localDeploy?: string;
    appSettingsExtension?: string;
    restartService?: string;
    test?: boolean;
    baseUrl?: string | string[];
    desktop?: boolean;
    mobile?: boolean;
    relativePaths?: boolean;
    old?: boolean;
    bundled?: boolean;
    '-'?: string[];
    d?: string[];
    loadCommandLine?: boolean;
}

export interface SocialStackConfig {
    calledFromPath: string;
    projectRoot: string;
    commandLine: CliOptions;

    force?: boolean;
    minified?: boolean;
    noCache?: boolean;
    apiUrl?: string;
    instanceUrl?: string;
    compress?: boolean;
    bundled?: boolean;
    baseUrl?: string;
    relativePaths?: boolean;
    loadedAppSettings?: any;

    lockfile?: string;
    onRequest?: (message: any) => void;
    __postCss?: any;

    createOptions?: {
        template?: string;
    };
}
