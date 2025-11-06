import { Controller, Post, Body, Res, Headers, HttpStatus } from '@nestjs/common';
import { PayService } from './pay.service';
import * as crypto from 'crypto';
import type { Response } from 'express';

@Controller('webhook')
export class PayRestController {
  constructor(private readonly payService: PayService) {}

  /**
   * Hàm sắp xếp key của object theo thứ tự alphabet (đệ quy)
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
   * Xác minh chữ ký theo thuật toán chuẩn Casso
   */
  private verifyCassoSignature(signatureHeader: string, data: any, secretKey: string): boolean {
    const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/);
    if (!match) return false;

    const timestamp = match[1];
    const receivedSignature = match[2];

    // Sắp xếp data theo key
    const sortedData = this.sortObjByKey(data);
    const message = `${timestamp}.${JSON.stringify(sortedData)}`;

    // Casso dùng SHA512
    const computedSignature = crypto
      .createHmac('sha512', secretKey)
      .update(message)
      .digest('hex');

    return computedSignature === receivedSignature;
  }

  @Post('casso')
  async handleCassoWebhook(
    @Body() body: any,
    @Headers('x-casso-signature') signatureHeader: string,
    @Res() res: Response,
  ) {
    try {
      const secretKey = process.env.CASSO_SECRET_KEY;
      if (!secretKey) {
        console.error('❌ Missing CASSO_SECRET_KEY');
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
      }

      // ✅ Kiểm tra chữ ký Casso
      const isValid = this.verifyCassoSignature(signatureHeader, body, secretKey);
      if (!isValid) {
        console.warn('❌ Invalid Casso signature');
        return res.status(HttpStatus.FORBIDDEN).json({ success: false, message: 'Invalid signature' });
      }

      // ✅ Gọi service xử lý giao dịch
      await this.payService.handleCassoTransaction(body.data);

      // ✅ Trả về đúng định dạng strict mode
      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error('🔥 Casso webhook error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false });
    }
  }
}
