// CLI falsa do Claude para teste: imprime o aviso de limite da assinatura (texto real do log de produção) e TRAVA,
// como a chamada que ficou presa até os 3 minutos. O servidor precisa perceber o aviso na hora e matar o processo.
process.stdin.resume();
process.stderr.write("You've hit your session limit · resets 9:30pm (UTC)\n");
setInterval(() => {}, 1000);
