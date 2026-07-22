import * as bcrypt from 'bcryptjs';

export class CryptoUtil {
  static async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  static async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
