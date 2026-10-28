# Agenda pessoal e alertas

## Navegação

Minha saúde → Minha agenda consulta o perfil ativo. Profissional → Minha agenda mantém a agenda privada do profissional, com suas regras existentes. Administração → Configuração de alertas define preferências da conta de login, aplicáveis aos perfis atualmente acessíveis.

## Agenda do paciente

PatientAppointment registra programações pessoais do perfil. Apenas seu titular ou tutor vigente pode consultar/criar/editar. Autorização clínica de um médico não concede gestão desta agenda. As APIs verificam o vínculo a cada operação e usam updatedAt para rejeitar edições concorrentes. Situações: agendado, concluído, cancelado. Não há exclusão física de compromissos.

A consulta mensal combina: programações pessoais; ProfessionalAppointment vinculado explicitamente ao patientId; retornos de HealthEvent com followUp habilitado e situação final/amended. Retornos pendentes de aprovação do paciente não aparecem. Não se duplica ou migra um retorno para outra tabela: a origem continua sendo o prontuário. Retornos e compromissos do profissional são somente consultáveis nesta tela, mantendo edição na origem. As observações privadas da agenda profissional não são expostas ao paciente.

Calendário por ano/mês, escolha de dia, filtros por texto e situação, ordenação de colunas, detalhes expansíveis e paginação padrão acima/abaixo quando houver mais de dez registros. O servidor exige intervalo de até 32 dias. O limite mensal é enviado como instantes ISO do fuso local do navegador; datas são armazenadas em timestamptz. Programação pessoal/retorno não cria reserva automática de horário com um profissional; a tela informa que a confirmação deve ser combinada.

## Validação profissional

GET /admin/professionals exclui o profissional vinculado à própria conta administradora. A proibição preexistente de autoavaliação na API de decisão permanece. O alerta administrativo de perfis pendentes também exclui a própria conta. Ter autorização administrativa não permite aprovar a si mesmo.

## Preferências e central de alertas

AlertPreference guarda por conta os tipos habilitados e antecedência para consultas/agendas (0, 15, 30, 60, 120 minutos ou 1 dia). As configurações usam controle de versão e lista fechada de propriedades. Alertas de fila profissional são visíveis/configuráveis somente por administradores, com verificação no servidor; usuários comuns não podem alterar essa propriedade pela API.

Tipos: consultas/retornos do paciente; hora de medicamentos; fila de perfis a validar (admin); resultado da validação do próprio perfil (validado, recusado, suspenso); solicitações de acesso; atendimentos para confirmar; tutoria; compromissos/retornos da agenda profissional.

A central aparece somente quando há alertas e consulta o servidor a cada minuto enquanto o sistema está aberto. Não há e-mail, push, solicitação de permissão do navegador ou promessa de entrega com o aplicativo fechado. Os registros são derivados das fontes existentes, com revalidação de acesso, sem copiar conteúdo clínico para uma caixa de mensagens. Cada destinatário pode silenciar seus alertas sem afetar outro responsável.

Consultas e compromissos só alertam se seus próprios alertas estiverem ativos, dentro da antecedência e até 24 horas após o horário. Compromissos concluídos/cancelados não alertam. Medicamentos exigem agenda ativa, preferência do paciente e do medicamento ligadas, destinatário selecionado e acesso vigente; a ocorrência respeita dias, período e fuso da medicação, em uma janela de 15 minutos. Desativar medicamentos na conta também é respeitado pelo dispatcher de testes (o transporte real continua desativado).

Decisões profissionais permanecem disponíveis na central por sete dias. Solicitações continuam visíveis enquanto pendentes. Marcar como lido grava apenas uma chave do alerta para aquela conta por trinta dias, e a API verifica se o alerta é acessível; isso não confirma tomada de remédio, consulta, autorização ou aprovação. Novas ocorrências de medicamentos têm chaves diferentes. Preferências não são documentos e não consomem franquia de armazenamento.

A central exibe os 50 alertas mais recentes, com indicação explícita quando há outros. Histórico completo permanece nas respectivas funcionalidades. A próxima integração mobile deverá usar estas preferências e as mesmas verificações de destinatário, sem ativar o transporte por e-mail.
