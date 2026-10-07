import { connect } from 'node:net';

const socket = connect(Number(process.env.PROBE_PORT ?? 3001), '127.0.0.1');
socket.setTimeout(2000);
socket.once('connect', () => socket.end());
socket.once('error', () => { process.exitCode = 1; });
socket.once('timeout', () => { socket.destroy(); process.exitCode = 1; });
