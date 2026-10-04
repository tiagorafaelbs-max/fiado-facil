export interface Retangulo { x: number; y: number; width: number; height: number }

const MARGEM_LATERAL = 18   // distância do botão flutuante até a borda (mesma do estilo fabCaixa)
const FOLGA = 10            // folga em volta do botão para não "encostar" no controle

// Decide onde o botão flutuante fica para não cobrir controles da tela: no canto direito (padrão); se algum
// controle estiver por baixo dele, no esquerdo; se os dois cantos estiverem ocupados, escondido.
// `fab` é a posição atual do botão na janela (só y, largura e altura importam); `controles` são os retângulos
// dos botões que não podem ficar cobertos.
export function escolherLadoFab(
  fab: Retangulo,
  controles: (Retangulo | null)[],
  larguraTela: number,
): 'direita' | 'esquerda' | 'oculto' {
  const cobre = (r: Retangulo | null, x0: number, x1: number) =>
    !!r && r.y < fab.y + fab.height + FOLGA && r.y + r.height > fab.y - FOLGA && r.x < x1 && r.x + r.width > x0
  const ocupado = (x0: number, x1: number) => controles.some(r => cobre(r, x0, x1))
  const direita: [number, number] = [larguraTela - MARGEM_LATERAL - fab.width - FOLGA, larguraTela]
  const esquerda: [number, number] = [0, MARGEM_LATERAL + fab.width + FOLGA]
  if (!ocupado(...direita)) return 'direita'
  if (!ocupado(...esquerda)) return 'esquerda'
  return 'oculto'
}
