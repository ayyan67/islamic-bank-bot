import { env } from '../config/env.js';
import { Database } from '../infra/db/database.js';
import { IdentityRepository } from '../infra/db/repositories/identityRepository.js';
import { InteractionDedupRepository } from '../infra/db/repositories/interactionDedupRepository.js';
import { logger } from '../infra/logging/logger.js';
import { RuntimeMetrics } from '../infra/metrics/runtimeMetrics.js';
import { AccessRepository } from '../modules/access/repository.js';
import { AccessService } from '../modules/access/service.js';
import { ClubsRepository } from '../modules/clubs/repository.js';
import { ClubsService } from '../modules/clubs/service.js';
import { CommunityRepository } from '../modules/community/repository.js';
import { CommunityService } from '../modules/community/service.js';
import { EconomyRepository } from '../modules/economy/repository.js';
import { EconomyService } from '../modules/economy/service.js';
import { LedgerRepository } from '../modules/ledger/repository.js';
import { LedgerService } from '../modules/ledger/service.js';
import { PolicyRepository } from '../modules/policy/repository.js';
import { PolicyService } from '../modules/policy/service.js';
import { GuildSettingsRepository } from '../modules/guild-settings/repository.js';
import { GuildSettingsService } from '../modules/guild-settings/service.js';
import { ShopRepository } from '../modules/shop/repository.js';
import { ShopService } from '../modules/shop/service.js';
import { BountyRepository } from '../modules/bounty/repository.js';
import { BountyService } from '../modules/bounty/service.js';
import { VaultRepository } from '../modules/vault/repository.js';
import { VaultService } from '../modules/vault/service.js';
import { TriviaRepository } from '../modules/trivia/repository.js';
import { TriviaService } from '../modules/trivia/service.js';
import { DropRepository } from '../modules/drops/repository.js';
import { DropService } from '../modules/drops/service.js';
import { WorshipRepository } from '../modules/worship/repository.js';
import { WorshipService } from '../modules/worship/service.js';
import { ReminderRepository } from '../modules/reminders/repository.js';
import { ReminderService } from '../modules/reminders/service.js';
import { NotificationsRepository } from '../modules/notifications/repository.js';
import { NotificationsService } from '../modules/notifications/service.js';
import { NotificationsDispatcher } from '../modules/notifications/dispatcher.js';
import { HangmanService } from '../modules/games/hangman/service.js';
import { RaceService } from '../modules/games/race/service.js';
import { Connect4Service } from '../modules/games/connect4/service.js';
import { ChallengeRepository } from '../modules/challenges/repository.js';
import { ChallengeService } from '../modules/challenges/service.js';
import { DigestService } from '../modules/digest/service.js';
import { ReactionRolesRepository } from '../modules/reaction-roles/repository.js';
import { ReactionRolesService } from '../modules/reaction-roles/service.js';
import { StatsRepository } from '../modules/stats/repository.js';
import { StatsService } from '../modules/stats/service.js';
import { EconomyScopeService } from '../modules/economy-scope/service.js';

export class AppContainer {
  readonly env = env;
  readonly logger = logger;
  readonly db: Database;
  readonly metrics = new RuntimeMetrics();

  readonly identityRepo: IdentityRepository;
  readonly interactionDedupRepo: InteractionDedupRepository;
  readonly ledgerRepo: LedgerRepository;
  readonly economyRepo: EconomyRepository;
  readonly vaultRepo: VaultRepository;
  readonly worshipRepo: WorshipRepository;
  readonly communityRepo: CommunityRepository;
  readonly clubsRepo: ClubsRepository;
  readonly triviaRepo: TriviaRepository;
  readonly accessRepo: AccessRepository;
  readonly policyRepo: PolicyRepository;
  readonly shopRepo: ShopRepository;
  readonly dropRepo: DropRepository;
  readonly reminderRepo: ReminderRepository;
  readonly guildSettingsRepo: GuildSettingsRepository;
  readonly bountyRepo: BountyRepository;
  readonly notificationsRepo: NotificationsRepository;
  readonly challengeRepo: ChallengeRepository;
  readonly reactionRolesRepo: ReactionRolesRepository;
  readonly statsRepo: StatsRepository;

  readonly ledgerService: LedgerService;
  readonly economyService: EconomyService;
  readonly vaultService: VaultService;
  readonly worshipService: WorshipService;
  readonly communityService: CommunityService;
  readonly clubsService: ClubsService;
  readonly triviaService: TriviaService;
  readonly accessService: AccessService;
  readonly policyService: PolicyService;
  readonly shopService: ShopService;
  readonly dropService: DropService;
  readonly reminderService: ReminderService;
  readonly bountyService: BountyService;
  readonly notificationsService: NotificationsService;
  readonly notificationsDispatcher: NotificationsDispatcher;
  readonly hangmanService: HangmanService;
  readonly raceService: RaceService;
  readonly connect4Service: Connect4Service;
  readonly guildSettingsService: GuildSettingsService;
  readonly challengeService: ChallengeService;
  readonly digestService: DigestService;
  readonly reactionRolesService: ReactionRolesService;
  readonly statsService: StatsService;
  readonly economyScope: EconomyScopeService;

  constructor(databasePath = env.DATABASE_PATH) {
    this.db = new Database(databasePath);

    this.identityRepo = new IdentityRepository(this.db);
    this.interactionDedupRepo = new InteractionDedupRepository(this.db);
    this.ledgerRepo = new LedgerRepository(this.db);
    this.economyRepo = new EconomyRepository(this.db);
    this.vaultRepo = new VaultRepository(this.db);
    this.worshipRepo = new WorshipRepository(this.db);
    this.communityRepo = new CommunityRepository(this.db);
    this.clubsRepo = new ClubsRepository(this.db);
    this.triviaRepo = new TriviaRepository(this.db);
    this.accessRepo = new AccessRepository(this.db);
    this.policyRepo = new PolicyRepository(this.db);
    this.shopRepo = new ShopRepository(this.db);
    this.dropRepo = new DropRepository(this.db);
    this.reminderRepo = new ReminderRepository(this.db);
    this.guildSettingsRepo = new GuildSettingsRepository(this.db);
    this.bountyRepo = new BountyRepository(this.db);
    this.notificationsRepo = new NotificationsRepository(this.db);
    this.challengeRepo = new ChallengeRepository(this.db);
    this.reactionRolesRepo = new ReactionRolesRepository(this.db);
    this.reactionRolesService = new ReactionRolesService(this.reactionRolesRepo);
    this.statsRepo = new StatsRepository(this.db);
    this.statsService = new StatsService(this.db, this.statsRepo);
    this.economyScope = new EconomyScopeService(this.db);

    this.ledgerService = new LedgerService(this.ledgerRepo, this.identityRepo);
    this.notificationsService = new NotificationsService(this.notificationsRepo);
    this.notificationsDispatcher = new NotificationsDispatcher(this.notificationsRepo);
    this.economyService = new EconomyService(
      this.db,
      this.economyRepo,
      this.identityRepo,
      this.ledgerService,
      this.notificationsService
    );
    this.vaultService = new VaultService(this.db, this.vaultRepo, this.identityRepo, this.ledgerService);
    this.worshipService = new WorshipService(
      this.db,
      this.worshipRepo,
      this.identityRepo,
      this.ledgerService,
      this.notificationsService
    );
    this.communityService = new CommunityService(
      this.db,
      this.communityRepo,
      this.identityRepo,
      this.ledgerService
    );
    this.clubsService = new ClubsService(this.db, this.clubsRepo, this.identityRepo);
    this.guildSettingsService = new GuildSettingsService(this.guildSettingsRepo);
    this.triviaService = new TriviaService(
      this.triviaRepo,
      this.identityRepo,
      this.ledgerService,
      this.economyRepo,
      this.guildSettingsService
    );
    this.accessService = new AccessService(this.accessRepo);
    this.policyService = new PolicyService(this.policyRepo);
    this.shopService = new ShopService(
      this.db,
      this.shopRepo,
      this.identityRepo,
      this.economyRepo,
      this.ledgerService
    );
    this.dropService = new DropService(
      this.db,
      this.dropRepo,
      this.identityRepo,
      this.economyRepo,
      this.ledgerService
    );
    this.reminderService = new ReminderService(this.reminderRepo, this.identityRepo);
    this.bountyService = new BountyService(
      this.db,
      this.bountyRepo,
      this.identityRepo,
      this.economyRepo,
      this.ledgerService,
      this.notificationsService
    );
    this.challengeService = new ChallengeService(
      this.db,
      this.challengeRepo,
      this.identityRepo,
      this.economyRepo,
      this.ledgerService,
      this.guildSettingsService
    );
    this.digestService = new DigestService(this.db, this.worshipRepo, this.guildSettingsService);
    this.hangmanService = new HangmanService();
    this.raceService = new RaceService();
    this.connect4Service = new Connect4Service();
  }

  close(): void {
    this.triviaService.stopAllGames();
    this.hangmanService.stopAllGames();
    this.raceService.stopAllGames();
    this.connect4Service.stopAllGames();
    this.db.close();
  }
}
