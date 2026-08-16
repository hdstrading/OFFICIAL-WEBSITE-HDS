/**
 * The way back in when nobody can sign in.
 *
 * Passwords live in the database, not the environment, so changing
 * ADMIN_PASSWORD and restarting does nothing once the first account exists.
 * This is the deliberate replacement for that: run it on the server, where
 * being able to run it at all already means having the machine.
 *
 *   npm run admin:reset -- someone@example.com
 *
 * It creates the account as a super admin if the address is new, resets the
 * password if it is not, and reactivates a switched-off account so a locked-out
 * owner is not left staring at a working password that still will not sign in.
 *
 * The password is read from stdin rather than the command line, because command
 * lines end up in shell history and in `ps` output for every user on the box.
 */

import crypto from 'node:crypto';
import readline from 'node:readline';
import { adminUsers } from './db.js';
import { hashPassword } from './auth.js';

const email = process.argv[2]?.trim();
if (!email || !email.includes('@')) {
  console.error('Usage: npm run admin:reset -- someone@example.com');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Muting the output stream is what stops the password appearing on screen
    // and in any terminal recording or screenshot of this session.
    const stdout = process.stdout as NodeJS.WriteStream & { muted?: boolean };
    const write = stdout.write.bind(stdout);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!stdout.muted) write(s);
    };
    write(question);
    stdout.muted = true;
    rl.question('', (answer) => {
      stdout.muted = false;
      write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = await askHidden(`New password for ${email}: `);
const again = await askHidden('Type it again: ');

if (password !== again) {
  console.error('Those did not match. Nothing was changed.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Please use at least 12 characters. Nothing was changed.');
  process.exit(1);
}

const existing = adminUsers.credentialsFor(email);
if (existing) {
  adminUsers.setPassword(existing.id, hashPassword(password));
  if (!existing.active) {
    adminUsers.update(existing.id, { active: true });
    console.info('The account was switched off, so it has been reactivated.');
  }
  console.info(`Password reset for ${existing.email} (${existing.role}).`);
} else {
  adminUsers.create({
    id: crypto.randomUUID(),
    email,
    name: 'Super Admin',
    role: 'super_admin',
    active: true,
    passwordHash: hashPassword(password),
  });
  console.info(`Created ${email} as a super admin.`);
}

process.exit(0);
