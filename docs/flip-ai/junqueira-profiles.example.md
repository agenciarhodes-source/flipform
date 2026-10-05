# Junqueira — exemplo de perfis para revisão

Esta configuração exemplifica os assuntos do escritório. Revisar critérios e pesos antes de incluir no Markdown Mestre. Trata-se de triagem; direito e documentação dependem de análise humana.

```flip-ai-profiles
{
  "version": 1,
  "profiles": [
    {
      "id": "salario_maternidade",
      "label": "Salário-maternidade",
      "description": "Busca orientação sobre maternidade, nascimento ou gestação e possível benefício.",
      "retrievalTerms": [
        "Salário-maternidade",
        "documentação Salário-maternidade"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Salário-maternidade.",
            "O relato tem relação indireta com Salário-maternidade.",
            "Há relação parcial com o tema; gestação ou nascimento; atividade e histórico informados.",
            "O relato é compatível com o tema e descreve gestação ou nascimento; atividade e histórico informados.",
            "O relato é claro e detalhado sobre gestação ou nascimento; atividade e histórico informados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: documentos pessoais, do nascimento e da atividade mencionados.",
            "Relata registros relevantes disponíveis: documentos pessoais, do nascimento e da atividade mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "voo_atrasado",
      "label": "Voo atrasado",
      "description": "Relata atraso ou problema com voo e busca orientação sobre o ocorrido.",
      "retrievalTerms": [
        "Voo atrasado",
        "documentação Voo atrasado"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Voo atrasado.",
            "O relato tem relação indireta com Voo atrasado.",
            "Há relação parcial com o tema; voo e problema relatados; datas, duração e impacto quando informados.",
            "O relato é compatível com o tema e descreve voo e problema relatados; datas, duração e impacto quando informados.",
            "O relato é claro e detalhado sobre voo e problema relatados; datas, duração e impacto quando informados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: passagens, cartões de embarque, comunicações e comprovantes mencionados.",
            "Relata registros relevantes disponíveis: passagens, cartões de embarque, comunicações e comprovantes mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "pensao_por_morte",
      "label": "Pensão por morte",
      "description": "Busca orientação sobre benefício após falecimento de familiar.",
      "retrievalTerms": [
        "Pensão por morte",
        "documentação Pensão por morte"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Pensão por morte.",
            "O relato tem relação indireta com Pensão por morte.",
            "Há relação parcial com o tema; falecimento e relação com a pessoa falecida relatados.",
            "O relato é compatível com o tema e descreve falecimento e relação com a pessoa falecida relatados.",
            "O relato é claro e detalhado sobre falecimento e relação com a pessoa falecida relatados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: documentos do falecimento, relação e histórico mencionados.",
            "Relata registros relevantes disponíveis: documentos do falecimento, relação e histórico mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "emprestimo_fraudulento",
      "label": "Empréstimo fraudulento",
      "description": "Relata empréstimo que afirma não ter contratado ou autorizado.",
      "retrievalTerms": [
        "Empréstimo fraudulento",
        "documentação Empréstimo fraudulento"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Empréstimo fraudulento.",
            "O relato tem relação indireta com Empréstimo fraudulento.",
            "Há relação parcial com o tema; operação contestada e razão da contestação informadas.",
            "O relato é compatível com o tema e descreve operação contestada e razão da contestação informadas.",
            "O relato é claro e detalhado sobre operação contestada e razão da contestação informadas; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: extratos, contrato ou registros da contestação mencionados.",
            "Relata registros relevantes disponíveis: extratos, contrato ou registros da contestação mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "descontos_abusivos",
      "label": "Descontos abusivos",
      "description": "Busca orientação sobre descontos ou cobranças que considera indevidos.",
      "retrievalTerms": [
        "Descontos abusivos",
        "documentação Descontos abusivos"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Descontos abusivos.",
            "O relato tem relação indireta com Descontos abusivos.",
            "Há relação parcial com o tema; desconto ou cobrança e seu impacto relatados.",
            "O relato é compatível com o tema e descreve desconto ou cobrança e seu impacto relatados.",
            "O relato é claro e detalhado sobre desconto ou cobrança e seu impacto relatados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: extratos, comprovantes e registros de atendimento mencionados.",
            "Relata registros relevantes disponíveis: extratos, comprovantes e registros de atendimento mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "bpc_loas",
      "label": "BPC/LOAS",
      "description": "Busca informações sobre benefício assistencial sem definir ainda o perfil específico.",
      "retrievalTerms": [
        "BPC/LOAS",
        "documentação BPC/LOAS"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre BPC/LOAS.",
            "O relato tem relação indireta com BPC/LOAS.",
            "Há relação parcial com o tema; necessidade assistencial e situação familiar relatadas.",
            "O relato é compatível com o tema e descreve necessidade assistencial e situação familiar relatadas.",
            "O relato é claro e detalhado sobre necessidade assistencial e situação familiar relatadas; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: cadastros, documentos familiares e comprovantes mencionados.",
            "Relata registros relevantes disponíveis: cadastros, documentos familiares e comprovantes mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "bpc_autismo",
      "label": "BPC Autismo",
      "description": "Busca orientação sobre benefício assistencial em contexto de autismo relatado.",
      "retrievalTerms": [
        "BPC Autismo",
        "documentação BPC Autismo"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre BPC Autismo.",
            "O relato tem relação indireta com BPC Autismo.",
            "Há relação parcial com o tema; autismo relatado, necessidades de apoio e contexto familiar informados.",
            "O relato é compatível com o tema e descreve autismo relatado, necessidades de apoio e contexto familiar informados.",
            "O relato é claro e detalhado sobre autismo relatado, necessidades de apoio e contexto familiar informados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: relatórios, cadastros e documentos familiares mencionados.",
            "Relata registros relevantes disponíveis: relatórios, cadastros e documentos familiares mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "bpc_idoso",
      "label": "BPC Idoso",
      "description": "Busca orientação sobre benefício assistencial para pessoa idosa.",
      "retrievalTerms": [
        "BPC Idoso",
        "documentação BPC Idoso"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre BPC Idoso.",
            "O relato tem relação indireta com BPC Idoso.",
            "Há relação parcial com o tema; pessoa idosa e contexto familiar relatados.",
            "O relato é compatível com o tema e descreve pessoa idosa e contexto familiar relatados.",
            "O relato é claro e detalhado sobre pessoa idosa e contexto familiar relatados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: documentos pessoais, cadastros e comprovantes familiares mencionados.",
            "Relata registros relevantes disponíveis: documentos pessoais, cadastros e comprovantes familiares mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "aposentadoria_geral",
      "label": "Aposentadoria geral",
      "description": "Busca orientação sobre aposentadoria e histórico de trabalho ou contribuições.",
      "retrievalTerms": [
        "Aposentadoria geral",
        "documentação Aposentadoria geral"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Aposentadoria geral.",
            "O relato tem relação indireta com Aposentadoria geral.",
            "Há relação parcial com o tema; objetivo de aposentadoria e histórico relatados.",
            "O relato é compatível com o tema e descreve objetivo de aposentadoria e histórico relatados.",
            "O relato é claro e detalhado sobre objetivo de aposentadoria e histórico relatados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: histórico contributivo e documentos de trabalho mencionados.",
            "Relata registros relevantes disponíveis: histórico contributivo e documentos de trabalho mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "aposentadoria_invalidez",
      "label": "Aposentadoria por invalidez",
      "description": "Busca orientação sobre aposentadoria em contexto de incapacidade relatada.",
      "retrievalTerms": [
        "Aposentadoria por invalidez",
        "documentação Aposentadoria por invalidez"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Aposentadoria por invalidez.",
            "O relato tem relação indireta com Aposentadoria por invalidez.",
            "Há relação parcial com o tema; limitações relatadas, atividade e histórico informados.",
            "O relato é compatível com o tema e descreve limitações relatadas, atividade e histórico informados.",
            "O relato é claro e detalhado sobre limitações relatadas, atividade e histórico informados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: relatórios e documentos de atividade ou contribuição mencionados.",
            "Relata registros relevantes disponíveis: relatórios e documentos de atividade ou contribuição mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    },
    {
      "id": "auxilio_acidente",
      "label": "Auxílio-acidente",
      "description": "Busca orientação sobre sequela ou limitação após acidente.",
      "retrievalTerms": [
        "Auxílio-acidente",
        "documentação Auxílio-acidente"
      ],
      "criteria": [
        {
          "id": "contexto",
          "label": "Aderência do contexto relatado",
          "weight": 50,
          "levels": [
            "A pessoa informou que não busca atendimento sobre Auxílio-acidente.",
            "O relato tem relação indireta com Auxílio-acidente.",
            "Há relação parcial com o tema; acidente, sequela e atividade relatados.",
            "O relato é compatível com o tema e descreve acidente, sequela e atividade relatados.",
            "O relato é claro e detalhado sobre acidente, sequela e atividade relatados; permite revisão humana."
          ]
        },
        {
          "id": "documentacao",
          "label": "Documentação relatada",
          "weight": 30,
          "levels": [
            "A pessoa informou que não possui documentação relacionada.",
            "A pessoa relata poucos registros e dificuldade em localizá-los.",
            "Relata parte dos registros: relatórios e documentos do acidente ou atividade mencionados.",
            "Relata registros relevantes disponíveis: relatórios e documentos do acidente ou atividade mencionados.",
            "Relata documentação relacionada organizada para revisão humana; a validade ainda será conferida."
          ]
        },
        {
          "id": "intencao",
          "label": "Intenção de prosseguir",
          "weight": 20,
          "levels": [
            "A pessoa disse que não quer prosseguir.",
            "Disse que está apenas pesquisando por enquanto.",
            "Demonstrou interesse em entender os próximos passos.",
            "Pediu análise do caso ou orientação para enviar informações.",
            "Pediu explicitamente para continuar com o time e disponibilizar as informações."
          ]
        }
      ]
    }
  ]
}
```
