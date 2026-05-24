//go:build linux && cgo

package platform

/*
#include <signal.h>

// Mirrors Wails v3 linux_cgo.go install_signal_handlers (WebKit resets SA_ONSTACK).
static void fix_signal(int signum) {
    struct sigaction st;
    if (sigaction(signum, NULL, &st) != 0) {
        return;
    }
    st.sa_flags |= SA_ONSTACK;
    sigaction(signum, &st, NULL);
}

void goldbus_install_signal_handlers(void) {
#if defined(SIGABRT)
    fix_signal(SIGABRT);
#endif
#if defined(SIGBUS)
    fix_signal(SIGBUS);
#endif
#if defined(SIGFPE)
    fix_signal(SIGFPE);
#endif
#if defined(SIGSEGV)
    fix_signal(SIGSEGV);
#endif
}

static int read_sigaction_flags(int signum) {
    struct sigaction st;
    if (sigaction(signum, NULL, &st) != 0) {
        return -1;
    }
    return (int)st.sa_flags;
}
*/
import "C"

import "syscall"

const saOnStack = 0x08000000

// InstallGoCompatibleSignalHandlers adds SA_ONSTACK to crash signals after WebKit/GTK init.
func InstallGoCompatibleSignalHandlers() {
	C.goldbus_install_signal_handlers()
}

// SignalHandlerFlags returns sigaction sa_flags for signum, or ok=false on error.
func SignalHandlerFlags(signum int) (flags int, ok bool) {
	f := int(C.read_sigaction_flags(C.int(signum)))
	if f < 0 {
		return 0, false
	}
	return f, true
}

// ProbeGoWebkitSignals probes SIGSEGV and SIGUSR1 (JSC GC on Linux).
func ProbeGoWebkitSignals() map[string]SignalProbe {
	out := make(map[string]SignalProbe, 2)
	for name, sig := range map[string]int{
		"SIGSEGV": int(syscall.SIGSEGV),
		"SIGUSR1": int(syscall.SIGUSR1),
	} {
		flags, ok := SignalHandlerFlags(sig)
		out[name] = SignalProbe{
			Signum:     sig,
			Flags:      flags,
			HasOnStack: ok && flags&saOnStack != 0,
			ProbeOK:    ok,
		}
	}
	return out
}
