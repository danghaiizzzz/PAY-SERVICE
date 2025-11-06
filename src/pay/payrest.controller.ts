import { Controller, Post, Body, Res, Headers, HttpStatus } from '@nestjs/common';
import { PayService } from './pay.service';
import * as crypto from 'crypto';
import type { Response } from 'express';

@Controller('webhook')
export class PayRestController {
  constructor(private readonly payService: PayService) {}

  @Post('casso')
  async handleCassoWebhook(
    @Body() body: any,
    @Headers('x-casso-signature') signature: string,
    @Res() res: Response,
  ) {
    try {
      const secretKey = process.env.CASSO_SECRET_KEY;
      if (!secretKey) {
        console.error('❌ Missing CASSO_SECRET_KEY');
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
      }

      // ✅ Tạo chữ ký từ body để kiểm tra
      const computedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(JSON.stringify(body))
        .digest('hex');

      if (computedSignature !== signature) {
        console.warn('❌ Invalid signature from Casso');
        return res.status(HttpStatus.FORBIDDEN).json({ success: false, message: 'Invalid signature' });
      }

      // ✅ Gọi service xử lý giao dịch
      await this.payService.handleCassoTransaction(body.data);

      // ✅ Trả về đúng format mà Casso yêu cầu (strict mode)
      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error('🔥 Casso webhook error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
    }
  }
}
