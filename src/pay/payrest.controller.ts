import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { PayService } from './pay.service';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

@Controller('webhook')
export class PayRestController {
  constructor(private readonly payService: PayService) {}

  /** Đệ quy sắp xếp object theo key (giống Java TreeMap) */
  private sortObjByKey(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.sortObjByKey(v));

    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = this.sortObjByKey(obj[key]);
      });
    return sorted;
  }

  /** Verify chữ ký Casso */
  private verifyCassoSignature(signatureHeader: string, data: any, secretKey: string): boolean {
    if (!signatureHeader) return false;

    const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/i);
    if (!match) return false;

    const timestamp = match[1];
    const receivedSig = match[2];

    const sortedData = this.sortObjByKey(data);
    const message = `${timestamp}.${JSON.stringify(sortedData)}`;

    const hmac = crypto.createHmac('sha512', secretKey);
    hmac.update(Buffer.from(message, 'utf8'));
    const computedSig = hmac.digest('hex');

    return computedSig === receivedSig;
  }

  @Post('casso')
  async handleCassoWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const secretKey = '9BYox3DBqpHriGbrYvXQX8utACGPiUHYuUJX9jzK9uKDY8a1bumpIexSE8kQfiwm';
      const signatureHeader = req.headers['x-casso-signature'] as string;

      // ⚠️ Lưu ý: cần bật rawBody trong main.ts
      const rawBody = (req as any).rawBody?.toString();
      if (!rawBody) {
        console.error('❌ rawBody not available');
        return res.status(400).json({ success: false, message: 'Missing rawBody' });
      }

      const parsedBody = JSON.parse(rawBody);

      const isValid = this.verifyCassoSignature(signatureHeader, parsedBody, secretKey);
      if (!isValid) {
        console.warn('❌ Invalid signature');
        return res.status(HttpStatus.FORBIDDEN).json({ success: false, message: 'Invalid signature' });
      }

      console.log('✅ Verified Casso webhook:', parsedBody);

      await this.payService.handleCassoTransaction(parsedBody);

      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error('🔥 Webhook error:', error);
      return res.status(500).json({ success: false });
    }
  }
}

/*

{ "error": 0, 
 "data": 
 { "id": 0, // Mã định danh duy nhất của giao dịch (Casso quy định) 
 // "reference": "BANK_REF_ID", // Mã giao dịch từ phía ngân hàng 
 // "description": "giao dich thu nghiem", // Nội dung giao dịch 
 // "amount": 599000, // Số tiền giao dịch 
 // "runningBalance": 25000000, // Số dư sau giao dịch 
 // "transactionDateTime": "2025-02-12 15:36:21", // Thời gian giao dịch 
 // "accountNumber": "88888888", // Số tài khoản mà giao dịch thuộc về 
 // "bankName": "VPBank", // Tên ngân hàng 
 // "bankAbbreviation": "VPB", // Viết tắt tên ngân hàng 
 // "virtualAccountNumber": "", // Tài khoản ảo 
 // "virtualAccountName": "", // Tên tài khoản ảo 
 // "counterAccountName": "", // Tên tài khoản đối ứng 
 // "counterAccountNumber": "", // Tài khoản đối ứng 
 // "counterAccountBankId": "", // Mã ngân hàng đối ứng 
 // "counterAccountBankName": "" // Tên ngân hàng đối ứng } }

*/