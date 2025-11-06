import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { PayService } from './pay.service';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

@Controller('webhook')
export class PayRestController {
  constructor(private readonly payService: PayService) {}

  /**
   * Đệ quy sắp xếp object theo key (chuẩn Casso yêu cầu)
   */
  private sortObjByKey(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = this.sortObjByKey(obj[key]);
      });
    return sorted;
  }

  /**
   * Xác minh chữ ký từ header `X-Casso-Signature`
   */
  private verifyCassoSignature(signatureHeader: string, data: any, secretKey: string): boolean {
    const match = signatureHeader?.match(/t=(\d+),v1=([a-f0-9]+)/);
    if (!match) return false;

    const timestamp = parseInt(match[1], 10); // ✅ ép kiểu số cho chuẩn
    const receivedSignature = match[2];

    const sortedData = this.sortObjByKey(data);
    const message = timestamp + '.' + JSON.stringify(sortedData); // ✅ giống Casso mẫu

    const computedSignature = crypto
      .createHmac('sha512', secretKey)
      .update(message)
      .digest('hex');

    return computedSignature === receivedSignature;
  }

  /**
   * Endpoint Webhook Casso V2
   */
  @Post('casso')
  async handleCassoWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const signatureHeader =
        req.headers['x-casso-signature'] || req.headers['X-Casso-Signature'];
      const secretKey = '8NoHFc7nWWwzGi9UufMacrcRaRoHt6bgIyZxmSX5KXXrp9AY2i3mnNhiK4TzKRBh';

      if (!secretKey) {
        console.error('❌ Missing CASSO_SECRET_KEY');
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
      }

      // ⚠️ req.rawBody cần được bật trong main.ts (để Casso xác thực chính xác)
      const rawBody = (req as any).rawBody;
      const parsedBody = JSON.parse(rawBody);

      // ✅ Kiểm tra chữ ký
      const isValid = this.verifyCassoSignature(signatureHeader as string, parsedBody, secretKey);
      if (!isValid) {
        console.warn('❌ Invalid signature from Casso');
        return res
          .status(HttpStatus.FORBIDDEN)
          .json({ success: false, message: 'Invalid signature' });
      }

      // ✅ Xử lý giao dịch (bạn có thể bật lại khi cần)
      // await this.payService.handleCassoTransaction(parsedBody.data);

      console.log('✅ Webhook verified & received:', parsedBody);
      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error('🔥 Casso webhook error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
    }
  }
}
