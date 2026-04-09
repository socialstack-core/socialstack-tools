// @ts-nocheck
import path from 'path';
import { jsConfigManager } from '../configManager';
import { getLocalConfig } from '../configManager';
import { MongoClient as MongoClient } from 'mongodb';
import mysql from 'mysql2/promise';

interface ConnectionInfo {
    type: 'mongo' | 'mysql';
    connectionString: string;
}

function parseMongoUrl(url: string) {
    const match = url.match(/mongodb:\/\/([^:]+)(?::(\d+))?\/([^?]+)/);
    if (!match) return null;
    return {
        host: match[1],
        port: match[2] || '27017',
        database: match[3]
    };
}

function parseMySqlConnection(connectionString: string) {
    const config = {};
    connectionString.split(';').forEach(part => {
        const [key, value] = part.split('=');
        if (key && value) {
            config[key.toLowerCase()] = value;
        }
    });
    return {
        host: config['server'] || 'localhost',
        port: config['port'] || '3306',
        database: config['database'],
        user: config['user'],
        password: config['password']
    };
}

function getPrimaryConnection(appsettings): ConnectionInfo | null {
    const mongoConn = appsettings.MongoConnectionStrings;
    const sqlConn = appsettings.ConnectionStrings;

    const mongoHasUrl = !!mongoConn?.DefaultConnection;
    const sqlHasUrl = !!sqlConn?.DefaultConnection;

    if (mongoHasUrl && !sqlHasUrl) {
        return { type: 'mongo', connectionString: mongoConn.DefaultConnection };
    }
    if (sqlHasUrl && !mongoHasUrl) {
        return { type: 'mysql', connectionString: sqlConn.DefaultConnection };
    }

    if (mongoHasUrl && sqlHasUrl) {
        if (mongoConn.IsPrimary && !sqlConn.IsPrimary) {
            return { type: 'mongo', connectionString: mongoConn.DefaultConnection };
        }
        if (sqlConn.IsPrimary && !mongoConn.IsPrimary) {
            return { type: 'mysql', connectionString: sqlConn.DefaultConnection };
        }
        throw new Error('Both database connections are configured but neither (or both) is marked as primary. Set IsPrimary: true on exactly one.');
    }

    return null;
}

async function createMongoDatabase(connectionString: string) {
    const parsed = parseMongoUrl(connectionString);
    if (!parsed) {
        throw new Error('Invalid MongoDB connection string: ' + connectionString);
    }

    if (parsed.host !== 'localhost') {
        console.log('MongoDB host is not localhost - skipping automatic setup.');
        return;
    }

    const url = `mongodb://${parsed.host}:${parsed.port}`;
    const client = new MongoClient(url, { useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db(parsed.database);

        const collections = await db.listCollections({ name: 'site_user' }).toArray();
        if (collections.length > 0) {
            console.log(`MongoDB database '${parsed.database}' already exists.`);
            return;
        }

        await db.createCollection('site_user');
        console.log(`MongoDB database '${parsed.database}' created with site_user collection.`);
    } finally {
        await client.close();
    }
}

async function createMySqlDatabase(connectionString: string, localConfig) {
    const parsed = parseMySqlConnection(connectionString);
    if (!parsed.database) {
        throw new Error('Invalid MySQL connection string - missing database');
    }

    if (parsed.host !== 'localhost') {
        console.log('MySQL host is not localhost - skipping automatic setup.');
        return;
    }

    const connection = mysql.createConnection({
        host: localConfig.databases.local.server || 'localhost',
        user: localConfig.databases.local.username,
        password: localConfig.databases.local.password,
        multipleStatements: true
    });

    try {
        const [rows] = await connection.query(`SHOW DATABASES LIKE '${parsed.database}'`);
        if (rows.length > 0) {
            console.log(`MySQL database '${parsed.database}' already exists.`);
            return;
        }

        await connection.query(`CREATE SCHEMA \`${parsed.database}\``);

        if (parsed.user && parsed.password) {
            const escUser = parsed.user.replace(/'/g, "\\'");
            const escPwd = parsed.password.replace(/'/g, "\\'");
            await connection.query(
                `CREATE USER '${escUser}'@'localhost' IDENTIFIED BY '${escPwd}';` +
                `GRANT ALL PRIVILEGES ON \`${parsed.database}\`.* TO '${escUser}'@'localhost'`
            );
        }

        console.log(`MySQL database '${parsed.database}' and user '${parsed.user}' created.`);
    } finally {
        connection.end();
    }
}

async function setupDatabaseFromAppsettings(projectRoot: string) {
    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    const appsettings = new jsConfigManager(appsettingsPath).get();

    const primaryConn = getPrimaryConnection(appsettings);

    if (!primaryConn) {
        console.log('No database connection configured in appsettings.json.');
        return;
    }

    const localConfig = getLocalConfig();
    if (!localConfig?.databases?.local) {
        throw new Error('socialstack tools not configured with a local database connection. Run "socialstack configure" first.');
    }

    if (primaryConn.type === 'mongo') {
        await createMongoDatabase(primaryConn.connectionString);
    } else {
        await createMySqlDatabase(primaryConn.connectionString, localConfig);
    }
}

export { setupDatabaseFromAppsettings, getPrimaryConnection, parseMongoUrl, parseMySqlConnection };
