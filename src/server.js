// src/server.js
require('dotenv').config();
const app = require('./app');
const { Worker } = require('worker_threads');
const {initCheckpointer} = require('./modules/ai/chatbot/agent/numor.agent');


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Numor API running on port ${PORT}`);
});


// Start PDF worker (ONLY ON MAIN INSTANCE)
// if (process.env.ENABLE_PDF_WORKER === 'true') {
//   const worker = new Worker(
//     require.resolve('./workers/invoice-pdf.worker.js'),
//       { type: 'commonjs' }
//   );

//   worker.on('online', () => {
//     console.log('Invoice PDF worker started');
//   });

//   worker.on('error', (err) => {
//     console.error('PDF Worker error:', err);
//   });

//   worker.on('exit', (code) => {
//     console.log('PDF Worker exited with code:', code);
//   });
// }

(async () => {
  await initCheckpointer();
  console.log("✅ LangGraph Postgres memory ready");
})();