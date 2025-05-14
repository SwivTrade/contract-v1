import * as fs from 'fs';
import * as path from 'path';

const keypairPath = path.join(__dirname, 'keypair.json');
const tokenDataPath = path.join(__dirname, 'token-data.json');

function cleanup() {
  if (fs.existsSync(keypairPath)) {
    fs.unlinkSync(keypairPath);
    console.log('Deleted keypair.json');
  }
  
  if (fs.existsSync(tokenDataPath)) {
    fs.unlinkSync(tokenDataPath);
    console.log('Deleted token-data.json');
  }
  
  console.log('Cleanup complete. Next test run will create fresh accounts.');
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  cleanup();
}

export { cleanup }; 