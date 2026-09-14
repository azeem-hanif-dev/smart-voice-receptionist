import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@ar/db";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;
  constructor(url?: string) {
    this.client = createPrismaClient(url);
  }
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
