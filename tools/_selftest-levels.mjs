import { classify } from "../store/levels.ts";

const cases = [
	["只读 grep 里的 rm 关键词（11-05 误报 1）", 'cd "$HOME/.pi/agent/packages/pi-superagent" && grep -n "rm -r\\|rm -rf\\|rm -" store/levels.ts | head -10', "L2"],
	["只读 grep -rl（11-05 误报 2）", 'cd "$HOME/.pi/agent/sessions" && ls -1t | head -5; grep -rl "co-test" . 2>/dev/null | head -3', "L2"],
	["真删除 rm -rf /tmp（11-05 真操作）", 'cd "$HOME" && rm -rf /tmp/guard-test && echo "COMMAND RAN"', "L3"],
	["&& 之后的真删除", 'cd "$HOME/site" && git reset -q && rm -rf /tmp/co-test /tmp/o.mjs', "L3"],
	["git push", 'git push origin main', "L3"],
	["引号里的 git push", 'echo "we should git push later"', "L2"],
	["bash -lc 包着的真删除", 'bash -lc "rm -rf /tmp/x"', "L3"],
	["python heredoc 里的字符串", 'python - <<\'PY\'\nprint("rm -rf /tmp/x")\nPY', "L2"],
	["npm publish", 'npm publish --tag beta', "L3"],
	["普通只读命令", 'ls -la "$HOME"', "L2"],
];

let fail = 0;
for (const [name, command, want] of cases) {
	const got = classify("bash", { command });
	const ok = got.level === want;
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      want=${want} got=${got.level} matched=${got.matched ?? "-"} scope=${got.scope}`);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
