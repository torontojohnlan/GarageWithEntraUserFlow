# This script is for "directory extension" which is different from "schema extension"
# schema extension uses cmdlet new-mgschemaExtension
# Schema extension scope is tenant wide, while directory extension scope is appplication specific
Import-Module Microsoft.Graph.Applications
Connect-MgGraph -Scopes "Application.ReadWrite.All" -NoWelcome
# $appId = "3814506d-9eb9-493d-adfb-f33a88a54b11"
$appId = "ef814c5a-d928-4738-a29f-3626299cfc6b" #object ID of My Garage Remote app instead of appId

# This is used as parameter of schemaExtension. Corresponding cmdlet is new-MgSchemaExtension
# $extension = @{
#     "name" = "deviceIDExtension"
#     "description" = "Custom device ID attribute for users"
#     "targetObjects" = @("User")
#     "properties" = @(
#         @{
#             "name" = "deviceID"
#             "type" = "String"
#         }
#     )
# }
$params = @{
	name = "deviceID"
	dataType = "String"
	targetObjects = @(
	"User"
)
}
New-MgApplicationExtensionProperty -ApplicationId $appId -BodyParameter $params
Get-MgApplicationExtensionProperty -ApplicationId $appId | select Name