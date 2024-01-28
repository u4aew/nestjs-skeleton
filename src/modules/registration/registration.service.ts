import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entity/user.entity';
import { MailerService } from '@nestjs-modules/mailer';
import { ResponseDto } from '../../shared/dto/response.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly mailerService: MailerService,
  ) {}

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<ResponseDto> {
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.createUser(email, hashedPassword, name);
    await this.sendConfirmationEmail(newUser);
    return { message: 'User registered successfully' };
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async createUser(
    email: string,
    hashedPassword: string,
    name: string,
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      name,
    });

    return this.userRepository.save(user);
  }

  private async generateEmailConfirmationToken(email: string): Promise<string> {
    return bcrypt.hash(email, 10);
  }

  private async sendConfirmationEmail(user: User) {
    const token = await this.generateEmailConfirmationToken(user.email);
    user.emailConfirmationToken = token;
    await this.userRepository.save(user);

    if (process.env.NODE_ENV === 'production') {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Подтверждение почты',
        template: 'confirmation',
        context: {
          name: user.name,
          token,
        },
      });
    }
  }

  async confirmEmail(token: string): Promise<ResponseDto> {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const user = await this.findUserByConfirmationToken(token);
    await this.markEmailAsConfirmed(user);
    return { message: 'Email confirmed successfully' };
  }

  private async findUserByConfirmationToken(token: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { emailConfirmationToken: token },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async markEmailAsConfirmed(user: User): Promise<User> {
    user.isEmailConfirmed = true;
    user.emailConfirmationToken = null;
    return this.userRepository.save(user);
  }
}
