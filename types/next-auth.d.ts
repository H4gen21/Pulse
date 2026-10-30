import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    /** Lowercase wallet address, present only for SIWE sessions. */
    address?: `0x${string}`;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    address?: `0x${string}`;
  }
}
