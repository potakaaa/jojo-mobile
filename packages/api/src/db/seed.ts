import 'dotenv/config';
import { runSeed } from './seed/seed';

runSeed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
