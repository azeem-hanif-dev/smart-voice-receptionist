import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma.service.js";
import { RedisService } from "./common/redis.service.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { OrgsService } from "./orgs/orgs.service.js";
import { OrgsController } from "./orgs/orgs.controller.js";
import { SettingsController } from "./orgs/settings.controller.js";
import { ProfileService } from "./orgs/profile.service.js";
import { AnalyticsService } from "./analytics/analytics.service.js";
import { AnalyticsController } from "./analytics/analytics.controller.js";
import { QueueService } from "./queues/queue.service.js";
import { RemindersService } from "./queues/reminders.service.js";
import { WorkersService } from "./queues/workers.service.js";
import { BookingsService } from "./bookings/bookings.service.js";
import { BookingsController } from "./bookings/bookings.controller.js";
import { EngineService, modelClientProvider } from "./engine/engine.service.js";
import { WhatsAppAdapter } from "./whatsapp/whatsapp.adapter.js";
import { WhatsAppAdminController, WhatsAppWebhookController } from "./whatsapp/webhook.controller.js";
import { ChannelRegistry } from "./inbound/channels.js";
import { OutboundService } from "./inbound/outbound.service.js";
import { InboundService } from "./inbound/inbound.service.js";
import { NotificationsService } from "./inbound/notifications.service.js";
import { SimulatorController } from "./inbound/simulator.controller.js";
import { ConversationsService } from "./conversations/conversations.service.js";
import { ConversationsController } from "./conversations/conversations.controller.js";
import { ContactsController } from "./contacts/contacts.controller.js";
import { IntegrationsController } from "./integrations/integrations.controller.js";

@Module({
  controllers: [
    AuthController,
    OrgsController,
    SettingsController,
    AnalyticsController,
    BookingsController,
    WhatsAppWebhookController,
    WhatsAppAdminController,
    SimulatorController,
    ConversationsController,
    ContactsController,
    IntegrationsController,
  ],
  providers: [
    PrismaService,
    RedisService,
    AuthService,
    OrgsService,
    ProfileService,
    AnalyticsService,
    QueueService,
    RemindersService,
    BookingsService,
    modelClientProvider,
    EngineService,
    WhatsAppAdapter,
    ChannelRegistry,
    OutboundService,
    NotificationsService,
    InboundService,
    ConversationsService,
    WorkersService,
  ],
})
export class AppModule {}
