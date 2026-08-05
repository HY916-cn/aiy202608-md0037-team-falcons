import { spawnSync } from "node:child_process";

export function resolvePnpmInvocation({
  environment = process.env,
  nodeExecutable = process.execPath,
  platform = process.platform,
} = {}) {
  const npmExecPath = environment.npm_execpath?.trim();
  if (npmExecPath) {
    return {
      command: nodeExecutable,
      prefixArguments: [npmExecPath],
    };
  }

  if (platform === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      prefixArguments: ["/d", "/s", "/c", "pnpm.cmd"],
    };
  }

  return {
    command: "pnpm",
    prefixArguments: [],
  };
}

export function runPnpmSync(arguments_, options = {}) {
  const invocation = resolvePnpmInvocation(options);
  return spawnSync(
    invocation.command,
    [...invocation.prefixArguments, ...arguments_],
    {
      cwd: options.cwd ?? process.cwd(),
      env: options.environment ?? process.env,
      shell: false,
      stdio: options.stdio ?? "inherit",
    },
  );
}
