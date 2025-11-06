import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pay } from './pay.entity';
import {
  GetPayByUserIdRequest,
  PayResponse,
  UpdateMoneyRequest,
  UpdateStatusRequest,
  CreatePayRequest,
  CreatePayOrderRequest,
  QrResponse,
} from 'proto/pay.pb';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class PayService {
  constructor(
    @InjectRepository(Pay)
    private readonly payRepository: Repository<Pay>,
  ) {}

  async getPayByUserId(data: GetPayByUserIdRequest): Promise<PayResponse> {
    const pay = await this.payRepository.findOne({ where: { userId: data.userId } });
    if (!pay) throw new RpcException({code: status.NOT_FOUND ,message: 'Không tìm thấy ví của user'});
    return {
        pay: {
            ...pay,
            updatedAt: pay.updatedAt.toISOString(), 
        },
        message: 'Lấy ví thành công',
    };
  }

  async updateMoney(data: UpdateMoneyRequest): Promise<PayResponse> {
    const pay = await this.payRepository.findOne({ where: { userId: data.userId } });
    if (!pay) throw new RpcException({code: status.NOT_FOUND ,message: 'Không tìm thấy ví của user'});
    if (pay.status === 'locked') throw new RpcException({code: status.PERMISSION_DENIED ,message: 'ví của bạn đã bị khóa'});

    const currentMoney = parseInt(pay.tien);
    const newMoney = currentMoney + Number(data.amount);
    if (newMoney < 0) throw new RpcException({code: status.INVALID_ARGUMENT ,message: 'Số tiền không hợp lệ'});

    pay.tien = newMoney.toString();
    pay.updatedAt = new Date();
    await this.payRepository.save(pay);

    return { 
        pay: {
            ...pay,
            updatedAt: pay.updatedAt.toISOString(), 
        },
        message: 'Cập nhật số dư thành công'
    };
  }

  async updateStatus(data: UpdateStatusRequest): Promise<PayResponse> {
    const pay = await this.payRepository.findOne({ where: { userId: data.userId } });
    if (!pay) throw new RpcException({code: status.NOT_FOUND ,message: 'Không tìm thấy ví của user'});

    pay.status = data.status;
    pay.updatedAt = new Date();
    await this.payRepository.save(pay);

    return { 
        pay: {
            ...pay,
            updatedAt: pay.updatedAt.toISOString(), 
        },
        message: `Đã ${data.status === 'locked' ? 'khóa' : 'mở khóa'} ví` 
    };
  }

  async createPay(data: CreatePayRequest): Promise<PayResponse> {
    const existed = await this.payRepository.findOne({ where: { userId: data.userId } });
    if (existed) throw new RpcException({code: status.ALREADY_EXISTS ,message: 'Ví đã tồn tại'});

    const newPay = this.payRepository.create({
      userId: data.userId,
      tien: '0',
      status: 'open',
      updatedAt: new Date(),
    });

    const saved = await this.payRepository.save(newPay);
    return { 
        pay: {
            ...saved,
            updatedAt: saved.updatedAt.toISOString(), 
        },
        message: 'Tạo ví thành công' 
    };
  }

  async createPayOrder(data: CreatePayOrderRequest): Promise<QrResponse> {
    const pay = await this.payRepository.findOne({ where: { userId: data.userId } });
    if (!pay) throw new RpcException({code: status.NOT_FOUND ,message: 'Không tìm thấy ví của user'});
    if (data.amount < 0) throw new RpcException({code: status.INVALID_ARGUMENT ,message: 'Số tiền không hợp lệ'});
    const qr = `https://img.vietqr.io/image/vietinbank-0396436954-XsnUkVz.jpg?amount=${data.amount}&addInfo=HDG%STUDIO${data.userId}%${data.username}%${data.amount}&accountName=Pham+Hai+Dang`;
    return { qr: qr, username: data.username };
  }

  async handleCassoTransaction(body: any): Promise<void> {
    try {
      // Casso V2 thường gửi dữ liệu trong body.data
      const transactions = body?.data ?? [];

      if (!Array.isArray(transactions) || transactions.length === 0) {
        console.log('❌ Webhook không có dữ liệu giao dịch.');
        return;
      }

      for (const tx of transactions) {
        const { description, amount, tid, cusum_balance } = tx;

        console.log(`📩 Nhận giao dịch ${tid}: +${amount}đ | ND: ${description}`);

        // 👉 Giả sử bạn có quy tắc NDCK kiểu "NAP USER123 50000"
        const match = description?.match(/USER(\d+)/i);
        if (!match) {
          console.log(`⚠️ Không tìm thấy userId trong NDCK: ${description}`);
          continue;
        }

        const userId = parseInt(match[1]);
        if (isNaN(userId)) {
          console.log(`⚠️ userId không hợp lệ trong NDCK: ${description}`);
          continue;
        }

        // 👉 Cộng tiền vào ví
        const request: UpdateMoneyRequest = {
          userId,
          amount: amount,
        };

        await this.updateMoney(request);

        console.log(`✅ Đã cộng ${amount}đ cho userId ${userId}`);
      }
    } catch (error) {
      console.log('❌ Lỗi khi xử lý webhook Casso:', error);
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Lỗi xử lý webhook Casso',
      });
    }
  }
}