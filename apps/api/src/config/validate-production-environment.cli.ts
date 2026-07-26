import { validateEnvironment } from './environment-validation';

validateEnvironment(process.env);
console.log('Production environment contract is valid.');
