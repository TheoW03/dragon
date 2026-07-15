#ifndef DRAGON_OWNERSHIP_CHECK_H
#define DRAGON_OWNERSHIP_CHECK_H

#include "dragon/AST.h"
#include <memory>
#include <string>
#include <vector>

namespace dragon {

/// A diagnostic produced by the ownership pass
struct OwnDiagnostic {
    SourceLocation location;
    std::string message;
};

/// del / own / dub ownership analysis (docs/001-memory.md, ADR docs/002).
///
/// A structured forward dataflow over heap-typed LOCAL bindings. Each binding
/// carries one state per program point - Owned, Owned* (owned with a recorded
/// escape/alias/capture fact), Borrowed, or Dead (deleted; moved arrives with
/// `own` transfer) - and `del` compiles only when the compiler can prove the
/// binding is the value's sole owner: an Owned local with no recorded fact.
/// Every rule's worst case is a compile error naming the escape site; the
/// analysis never changes runtime behavior.
///
/// v1 scope (slice A): `del` on locals. The state machine is refusal-
/// conservative: anything it cannot prove Owned refuses to `del` (a false
/// refusal is a diagnostic on correct code, never a wrong free). Scalar
/// locals carry no ownership; `del` on them only poisons the name
///
/// Runs AFTER the TypeChecker (expression types must be stamped so heap-typed
/// bindings can be distinguished from scalars). Builds its own scope tracking,
/// like DefiniteAssignment
class OwnershipCheck {
public:
    OwnershipCheck();
    ~OwnershipCheck();

    /// Analyze a module. Returns true when no ownership error was found.
    bool analyze(Module& module);

    /// All diagnostics gathered during the last analyze().
    const std::vector<OwnDiagnostic>& diagnostics() const;

    /// Whether the last analyze() reported any error.
    bool hasErrors() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace dragon

#endif // DRAGON_OWNERSHIP_CHECK_H
