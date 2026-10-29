export class TicketServiceUnavailableError extends Error {
  constructor() {
    super('O sistema de chamados está indisponível no momento.');
    this.name = 'TicketServiceUnavailableError';
  }
}

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Chamado ${ticketId} não encontrado.`);
    this.name = 'TicketNotFoundError';
  }
}

export class TicketNotReopenableError extends Error {
  constructor(public readonly ticketId: string) {
    super(`O chamado ${ticketId} não pode ser reaberto (resolvido há mais de 7 dias ou encerrado). Abra um novo.`);
    this.name = 'TicketNotReopenableError';
  }
}

export class InvalidTicketInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Dados do chamado inválidos: ${problems.join('; ')}`);
    this.name = 'InvalidTicketInputError';
  }
}

export class TicketAccessDeniedError extends Error {
  constructor() {
    super('Apenas analistas do service desk podem fazer isso.');
    this.name = 'TicketAccessDeniedError';
  }
}
