$certName = "CN=GarageRemoteApp"
$certPath = "Cert:\LocalMachine\My"
$cert = New-SelfSignedCertificate `
    -Subject $certName `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyLength 2048 `
    -CertStoreLocation $certPath `
    -NotAfter (Get-Date).AddYears(5) `
    -HashAlgorithm SHA256

Write-Output "Thumbprint: $($cert.Thumbprint)"

# Export the public certificate to a file
Export-Certificate -Cert $cert -FilePath "./garage-remote-app-public.cer"

# Export the private key to a PFX file
$pfxPath = ".\garage-remote-app-private.pfx"
# $securePwd = Read-Host "Enter PFX password" -AsSecureString
$securePwd = ConvertTo-SecureString "myCertPwd" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd
