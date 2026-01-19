import {spawn} from "child_process";

/**
 * Executes a command asynchronously using spawn.
 * @param command The command to run
 * @param args Array of arguments
 * @param options Optional spawn options
 * @returns Promise that resolves with stdout and stderr
 */
export function execAsync(
    command: string,
    args: string[] = [],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string[]; stderr: string[] }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {...options, shell: true});

        let stdout: string[] = [];
        let stderr: string[] = [];
        let stdoutBuffer = "";
        let stderrBuffer = "";

        child.stdout.on("data", (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                stdout.push(lines[i]);
            }
            stdoutBuffer = lines[lines.length - 1];
        });

        child.stderr.on("data", (data) => {
            stderrBuffer += data.toString();
            const lines = stderrBuffer.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                stderr.push(lines[i]);
            }
            stderrBuffer = lines[lines.length - 1];
        });

        child.on("error", (err) => {
            reject(err);
        });

        child.on("close", (code) => {
            if (stdoutBuffer.length > 0) {
                stdout.push(stdoutBuffer);
            }
            if (stderrBuffer.length > 0) {
                stderr.push(stderrBuffer);
            }

            if (code === 0) {
                resolve({stdout: stdout, stderr: stderr});
            } else {
                reject(new Error(`Command failed with code ${code}\n${stderr.join('\n')}`));
            }
        });
    });
}
