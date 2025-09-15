# This script is for "directory extension" which is different from "schema extension"
# schema extension uses cmdlet new-mgschemaExtension etc
# Schema extension scope is tenant wide, while directory extension scope is appplication specific
Connect-Graph -Scopes "User.ReadWrite.All" -NoWelcome
$Properties = @{}
$Properties.Add('extension_3814506d9eb9493dadfbf33a88a54b11_deviceID', "dummy4GarageAppOnly")
$UserId = (Get-MgUser -UserId admin@johngarage.onmicrosoft.com).Id
Update-MgUser -UserId $UserId -AdditionalProperties $Properties

Get-MgUser -UserId $UserId -Property "extension_3814506d9eb9493dadfbf33a88a54b11_deviceID"