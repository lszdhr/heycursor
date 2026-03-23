# =============================================================================
# Cursor Agent 终端卡住：按 Threads @bobo52310 的做法，在集成终端里不加载 p10k
# 用法：在「本机 WSL/Linux/macOS」的 ~/.zshrc 里按需合并。
#       Windows 上若 Cursor 默认终端是 WSL + zsh，改的是 WSL 里的 ~/.zshrc（在 WSL 里执行 nano/vim，不要用 Windows 路径瞎找）。
#       若用 Remote-SSH，则改远程那台机器上的 ~/.zshrc。
#
# 原则：
# 1) Powerlevel10k 的 instant prompt 必须在 .zshrc 很靠前的位置；在 Cursor/VS Code 里不要加载它。
# 2) 原来 source ~/.p10k.zsh 的地方，在集成终端里改为简单 PROMPT。
#
# 若你已有「非交互直接退出」，请保持它在文件最上面；下面两段放在它之后、且在 OMZ/插件之前
# （instant prompt 段仍要早于其他可能产生输出的配置）。
# =============================================================================

# --- 替换你原来的「p10k instant prompt」整段：仅在非 VS Code/Cursor 集成终端时加载 ---
if [[ "$TERM_PROGRAM" != "vscode" ]]; then
  if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
    source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
  fi
fi

# --- 放在原「source ~/.p10k.zsh」或「powerlevel10k」配置的位置：IDE 内用简单提示符 ---
if [[ "$TERM_PROGRAM" == "vscode" ]]; then
  PROMPT='%F{cyan}%1~%f %# '
  RPROMPT=''
else
  [[ -r ~/.p10k.zsh ]] && source ~/.p10k.zsh
fi
