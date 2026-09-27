// src/server.js
const { PORT } = require('./config/env');
const app = require('./app');
const { Worker } = require('worker_threads');
const {initCheckpointer} = require('./modules/ai/chatbot/agent/numor.agent');
const { startPdfSweeper } = require('./workers/pdf-sweeper.service');

app.listen(PORT, () => {
  console.log(`🚀 Numor API running on port ${PORT}`);
});

// Recovers invoices whose PDF job died between the database write and QStash,
// or whose worker crashed mid-run. Every pass is a conditional update, so
// running this on several instances at once is harmless.
if (process.env.PDF_SWEEPER_ENABLED !== 'false') {
  startPdfSweeper();
}


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