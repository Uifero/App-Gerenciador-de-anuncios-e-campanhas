// "npm run test:regras": sobe o emulador do Firestore e do Storage (projeto "demo-": nunca toca a produção, nem
// precisa de login), roda os testes de tests/regras/ e desliga o emulador.
// O emulador precisa de Java 21+. Se não houver "java" no PATH, usa um JDK portátil em %USERPROFILE%\.jdk\<pasta>.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';

const env = { ...process.env };
const temJava = spawnSync('java', ['-version'], { shell: true, stdio: 'ignore' }).status === 0;
if (!temJava) {
  const base = join(homedir(), '.jdk');
  const jdk = existsSync(base) && readdirSync(base).map((d) => join(base, d)).find((d) => existsSync(join(d, 'bin')));
  if (!jdk) {
    console.error('Falta o Java 21+ para o emulador do Firebase. Instale um JDK (ex.: Temurin 21) ou descompacte um em ~/.jdk/.');
    process.exit(1);
  }
  env.JAVA_HOME = jdk;
  env.PATH = `${join(jdk, 'bin')}${delimiter}${env.PATH || env.Path || ''}`;
  delete env.Path; // Windows: uma chave só
}

const temFirebase = spawnSync('firebase', ['--version'], { shell: true, stdio: 'ignore', env }).status === 0;
const cli = temFirebase ? 'firebase' : 'npx -y firebase-tools@15';
const r = spawnSync(`${cli} emulators:exec --only firestore,storage --project demo-gcc-regras "npx vitest run --config vitest.regras.config.js"`,
  { shell: true, stdio: 'inherit', env });
process.exit(r.status ?? 1);
