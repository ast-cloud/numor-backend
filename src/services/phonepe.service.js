import {
  MetaInfo,
  StandardCheckoutPayRequest
} from 'pg-sdk-node';

import { randomUUID } from 'crypto';
import { phonePeClient } from '../config/phonepe.client.js';

export const initiatePhonePePayment = async ({
  bookingId,
  amount,
  userId
}) => {
  const merchantOrderId = `BOOK_${bookingId}_${Date.now()}`;

  const metaInfo = MetaInfo.builder()
    .udf1(String(bookingId))
    .udf2(String(userId))
    .build();

  const request =
    StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amount * 100) // paisa
      .metaInfo(metaInfo)
      .redirectUrl(
        `${process.env.APP_URL}/payments/phonepe/redirect`
      )
      .expireAfter(900) // 15 minutes
      .message('CA Consultation Booking')
      .build();

  const response = await phonePeClient.pay(request);

  return {
    merchantOrderId,
    redirectUrl: response.redirectUrl,
    expireAt: response.expireAt
  };
};
