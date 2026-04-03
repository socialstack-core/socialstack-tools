import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import getAppDataPath from 'appdata-path';
import os from 'os';

var adp = getAppDataPath('socialstack');

function streamToBuffer(stream) {
	const chunks = [];
	return new Promise((resolve, reject) => {
		stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
		stream.on('error', (err) => reject(err));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
	});
}

function parseCalver(version: string): number[] {
	return version.split('.').map(v => parseInt(v, 10) || 0);
}

function compareCalver(a: number[], b: number[]): number {
	var maxLen = Math.max(a.length, b.length);
	
	for (var i = 0; i < maxLen; i++) {
		var av = i < a.length ? a[i] : 0;
		var bv = i < b.length ? b[i] : 0;
		
		if (av > bv) return 1;
		if (av < bv) return -1;
	}
	
	return 0;
}

var _memCachedBranchList: string[] | null = null;

function getBranchNames(): Promise<string[]> {
	if (_memCachedBranchList) {
		return Promise.resolve(_memCachedBranchList);
	}

	return new Promise((success, reject) => {
		https.get('https://api.github.com/repos/socialstack-core/modules/branches', function(res) {
			var bodyResponse = [];
			res.on('data', (d) => {
				bodyResponse.push(d);
			});

			res.on('end', () => {
				var jsonResp = bodyResponse.join('');
				var json = JSON.parse(jsonResp);
				var branchNames = json.map((branch: { name: string }) => branch.name);
				_memCachedBranchList = branchNames;
				success(branchNames);
			});
		}).on('error', reject);
	});
}

var _memCachedLatestCoreBranch: string | null = null;

function getLatestCoreBranch(): Promise<string> {
	if (_memCachedLatestCoreBranch) {
		return Promise.resolve(_memCachedLatestCoreBranch);
	}

	return getBranchNames().then(branches => {
		var latestBranch: string | null = null;
		var latestVersion: number[] = [];

		for (var i = 0; i < branches.length; i++) {
			var branch = branches[i];
			
			if (!branch.startsWith('core-')) {
				continue;
			}

			var versionStr = branch.substring(5);
			var version = parseCalver(versionStr);

			if (compareCalver(version, latestVersion) > 0) {
				latestVersion = version;
				latestBranch = branch;
			}
		}

		_memCachedLatestCoreBranch = latestBranch;
		return latestBranch;
	});
}

function getOrCacheVersionZip(branchName: string): Promise<fs.ReadStream> {
	var versionCache = adp + '/version_cache';

	return new Promise((success, reject) => {
		var versionCachePath = versionCache + '/' + branchName + '.zip';

		fs.mkdir(versionCache, { recursive: true }, (err) => {
			if (err && err.code != 'EEXIST') throw err;

			var readStream = fs.createReadStream(versionCachePath);

			readStream.on('open', function () {
				success(readStream);
			});

			readStream.on('error', function(err) {
				var url = 'https://github.com/socialstack-core/modules/archive/refs/heads/' + branchName + '.zip';

				https.get(url, function(response) {
					if (response.statusCode == 200 && response.headers['content-type'] == 'application/zip') {
						var cacheWriteStream = fs.createWriteStream(versionCachePath + '.tmp');

						response.pipe(cacheWriteStream);

						cacheWriteStream.on('finish', () => {
							try {
								fs.unlinkSync(versionCachePath);
							} catch {}

							fs.renameSync(versionCachePath + '.tmp', versionCachePath);

							readStream = fs.createReadStream(versionCachePath);

							readStream.on('open', function () {
								success(readStream);
							});

							readStream.on('error', function(err) {
								console.log(err);
								reject('Invalid cache i/o.');
							});
						});
					} else {
						reject('Invalid response from GitHub (' + url + ')');
					}
				});
			});
		});
	});
}

var _coreZipPathCache: { [branchName: string]: string } = {};

function getCoreZipPath(branchName: string): Promise<string> {
	if (_coreZipPathCache[branchName]) {
		return Promise.resolve(_coreZipPathCache[branchName]);
	}

	return new Promise((success, reject) => {
		var moduleTemplateCache = adp + '/module_template_cache';
		var extractDir = moduleTemplateCache + '/' + branchName;

		if (fs.existsSync(extractDir)) {
			_coreZipPathCache[branchName] = extractDir;
			return success(extractDir);
		}

		getOrCacheVersionZip(branchName).then(zipStream => {
			fs.mkdirSync(extractDir, { recursive: true });

			zipStream.pipe(unzip.Parse())
				.on('entry', (entry) => {
					var entryPath = entry.path;
					var parts = entryPath.split('/');

					var rootPrefix = parts[0] + '/';
					var relativePath = entryPath.substring(rootPrefix.length);

					if (relativePath === '' || relativePath.endsWith('/')) {
						entry.autodrain();
						return;
					}

					var destPath = path.join(extractDir, relativePath);
					var destDir = path.dirname(destPath);
					if (!fs.existsSync(destDir)) {
						fs.mkdirSync(destDir, { recursive: true });
					}

					if (entry.type === 'File') {
						entry.pipe(fs.createWriteStream(destPath));
					} else {
						entry.autodrain();
					}
				})
				.on('close', () => {
					_coreZipPathCache[branchName] = extractDir;
					success(extractDir);
				})
				.on('error', reject);
		}).catch(reject);
	});
}

function versionDistance(a: number[], b: number[]): number {
	var maxLen = Math.max(a.length, b.length);
	var distance = 0;

	for (var i = 0; i < maxLen; i++) {
		var av = i < a.length ? a[i] : 0;
		var bv = i < b.length ? b[i] : 0;
		distance += Math.abs(av - bv) * Math.pow(1000, maxLen - i - 1);
	}

	return distance;
}

function findClosestCoreBranch(targetVersion: string): Promise<string | null> {
	return getBranchNames().then(branches => {
		var targetParts = parseCalver(targetVersion);
		var closestBranch: string | null = null;
		var closestDistance = Infinity;

		for (var i = 0; i < branches.length; i++) {
			var branch = branches[i];

			if (!branch.startsWith('core-')) {
				continue;
			}

			var versionStr = branch.substring(5);
			var versionParts = parseCalver(versionStr);
			var distance = versionDistance(targetParts, versionParts);

			if (distance < closestDistance) {
				closestDistance = distance;
				closestBranch = branch;
			}
		}

		return closestBranch;
	});
}

export { getBranchNames, getLatestCoreBranch, getOrCacheVersionZip, getCoreZipPath, findClosestCoreBranch };
