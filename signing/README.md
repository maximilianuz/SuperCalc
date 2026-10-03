# Keystore de depuración

`debug.keystore` es una clave de **depuración** fija (no es secreta; contraseña `android`,
alias `androiddebugkey`). Está en el repo a propósito: así cada APK que genera el workflow
queda firmado con la misma clave y se puede instalar encima del anterior sin desinstalar
(y sin perder la lista ni el historial).

No la uses para publicar en Play Store.
