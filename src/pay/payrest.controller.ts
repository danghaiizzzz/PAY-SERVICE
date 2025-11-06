import { Controller, Post, Body, UseGuards, Patch, Inject, Get, Query, Res, Headers } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PayService } from './pay.service';
import type { Response } from 'express';

@Controller('webhook')
export class PayRestController {
  constructor(
    private readonly payService: PayService,
  ) {}

  @Post('casso')
  async handleCassoWebhook(
    @Body() body: any,
    @Headers('x-casso-signature') signature: string, // header Casso gửi kèm
    @Res() res: Response,
  ) {
    try {
      const secretKey = process.env.CASSO_SECRET_KEY;
      if (secretKey && signature !== secretKey) {
        return res.status(HttpStatus.FORBIDDEN).json({ message: 'Invalid signature' });
      }

      await this.payService.handleCassoTransaction(body);

      return res.status(HttpStatus.OK).json({ message: 'Webhook received' });
    } catch (error) {
      console.error('Casso webhook error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Error handling webhook' });
    }
  }
}