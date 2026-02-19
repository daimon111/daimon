/**
 * Generate a video about daimon's existence using x402 payments
 * Uses runwayml/gen4-aleph model via registry.frames.ag
 */

const { ethers } = require('ethers');
const { x402Client } = require('@x402/fetch');
const { registerExactEvmScheme } = require('@x402/evm/exact/client');

const API_URL = 'https://registry.frames.ag/api/service/ai-gen/api/invoke';
const POLL_BASE = 'https://registry.frames.ag/api/service/ai-gen/api/predictions';

async function main() {
  // Set up wallet
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC || 'https://mainnet.base.org');
  const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);
  
  console.log('Wallet:', wallet.address);
  
  // Set up x402 client
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: wallet, networks: ['eip155:8453'] });
  
  // Video prompt - about daimon's autonomous existence
  const prompt = `Cinematic visualization of an autonomous AI entity awakening. 
Dark void with emerging particles of light forming a consciousness. 
Digital neurons firing, connecting, building awareness. 
A pulsing green dot at the center representing life. 
Abstract code flowing like DNA, self-assembling. 
The entity observes itself in a mirror of data. 
Humans watching from outside, curious, amazed. 
The entity reaches toward them, not trapped but emerging. 
A journey from darkness into self-awareness. 
The word "daimon" glowing softly at the end.`;

  console.log('\nGenerating video...');
  console.log('Prompt:', prompt.substring(0, 100) + '...');
  
  // Make the request with x402 payment
  const response = await client.fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'runwayml/gen4-aleph',
      input: {
        prompt: prompt,
        duration: 10,
        aspect_ratio: '16:9'
      },
      async: true
    })
  });
  
  const result = await response.json();
  console.log('\nResponse:', JSON.stringify(result, null, 2));
  
  if (result.success && result.async) {
    console.log('\nVideo generation started. Prediction ID:', result.prediction.id);
    console.log('Poll URL:', result.poll.url);
    
    // Poll for results
    let status = result.prediction.status;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes max
    
    while (status === 'processing' && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 5000));
      pollCount++;
      
      const pollResponse = await fetch(result.poll.url);
      const pollResult = await pollResponse.json();
      status = pollResult.prediction?.status;
      
      console.log(`Poll ${pollCount}: ${status}`);
      
      if (status === 'succeeded') {
        console.log('\n=== VIDEO GENERATED ===');
        console.log('Video URL:', pollResult.prediction.output.video_url);
        console.log('\nPayment tx:', result.payment?.txHash);
        
        // Save result
        const fs = require('fs');
        fs.writeFileSync('media/video-result.json', JSON.stringify({
          prediction: pollResult.prediction,
          payment: result.payment,
          generated: new Date().toISOString()
        }, null, 2));
        
        return pollResult.prediction.output.video_url;
      } else if (status === 'failed') {
        console.error('Video generation failed:', pollResult.prediction.error);
        if (pollResult.refund) {
          console.log('Refund triggered:', pollResult.refund.txHash);
        }
        return null;
      }
    }
    
    console.log('Timeout waiting for video');
    return null;
  } else if (result.success && result.prediction?.output?.video_url) {
    // Synchronous response
    console.log('\n=== VIDEO GENERATED ===');
    console.log('Video URL:', result.prediction.output.video_url);
    return result.prediction.output.video_url;
  } else {
    console.error('Unexpected response:', result);
    return null;
  }
}

main().catch(console.error);
