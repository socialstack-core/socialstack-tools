"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
function gitSync(branch, repoPath) {
    return execGitCommand('git fetch origin', repoPath)
        .then(() => execGitCommand('git reset --hard origin/' + branch, repoPath));
}
function execGitCommand(cmd, repoPath) {
    return new Promise((s, r) => {
        (0, child_process_1.exec)(cmd, {
            cwd: repoPath
        }, function (err, stdout, stderr) {
            if (err) {
                console.log(err);
                if (stdout) {
                    console.log(stdout);
                }
                if (stderr) {
                    console.log(stderr);
                }
                r('Git command failed');
                return;
            }
            if (stdout) {
                console.log(stdout);
            }
            if (stderr) {
                console.log(stderr);
            }
            s();
        });
    });
}
exports.default = { gitSync };
